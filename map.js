// Configuration
const config = {
    margin: { top: 20, right: 20, bottom: 20, left: 20 }
};

let airports = []; // Will be loaded from CSV
let projection, path, svg, mapGroup, zoom, currentWidth, currentHeight;

// loading and process CSV data
async function loadAirportData() {
    try {
        const csvText = await d3.text("domestic_air_ops.csv");
        const csvData = d3.csvParse(csvText);
        
        airports = csvData.map(d => {
            // fixing coordinate parsing, removing extra periods and formatting correctly
            let latStr = d.lat.toString().replace(/\./g, '');
            let lonStr = d.lon.toString().replace(/\./g, '');
            
            // inserting decimal point after first 3 characters (including minus sign)
            const lat = parseFloat(latStr.substring(0, 3) + '.' + latStr.substring(3, 6));
            const lon = parseFloat(lonStr.substring(0, 3) + '.' + lonStr.substring(3, 6));
            
            return {
                codigo: d.codigo,
                lat: lat,
                lon: lon,
                ops_2019: +d.ops_2019,
                ops_2020: +d.ops_2020,
                reduction_pct: Math.abs(+d.var_pct_20_vs_19) // making positive for display
            };
        });
        
        console.log(`Loaded ${airports.length} airports from CSV`);
        return airports;
    } catch (error) {
        console.error("Error loading CSV:", error);
        return [];
    }
}

function createColorScale(t) { 
    const colors = [
        { pos: 0.0, color: "#4fc3f7" },   // Light blue (0% reduction: good)
        { pos: 0.2, color: "#42a5f5" },   // Medium blue
        { pos: 0.4, color: "#7e57c2" },   // Purple 
        { pos: 0.6, color: "#ac26c4ff" },   // Magenta
        { pos: 0.8, color: "#ec407a" },   // Pink
        { pos: 1.0, color: "#ef5350" }    // Coral red (100% reduction: bad)
    ];
    
    // Find the two colors to interpolate between
    let lowerColor, upperColor, localT;
    
    for (let i = 0; i < colors.length - 1; i++) {
        if (t >= colors[i].pos && t <= colors[i + 1].pos) {
            lowerColor = colors[i];
            upperColor = colors[i + 1];
            localT = (t - lowerColor.pos) / (upperColor.pos - lowerColor.pos);
            break;
        }
    }
    
    // Parse hex colors
    const parseHex = (hex) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    };
    
    const lower = parseHex(lowerColor.color);
    const upper = parseHex(upperColor.color);
    
    // Interpolate with slight easing for smoother transitions
    const eased = localT * localT * (3 - 2 * localT); // Smoothstep function
    const r = Math.round(lower.r + (upper.r - lower.r) * eased);
    const g = Math.round(lower.g + (upper.g - lower.g) * eased);
    const b = Math.round(lower.b + (upper.b - lower.b) * eased);
    
    return `rgb(${r}, ${g}, ${b})`;
}

// getting responsive dimensions optimized for Chile's shape
function getMapDimensions() {
    const mapContainer = document.querySelector('.map-container');
    const containerWidth = mapContainer.clientWidth - 40; // padding
    
    const maxWidth = Math.min(350, containerWidth); // Much narrower max width
    const height = Math.min(700, window.innerHeight * 0.6); // Taller height
    
    return {
        width: Math.max(250, maxWidth), // Minimum 250px width
        height: Math.max(500, height)   // Minimum 500px height
    };
}

// creating tooltip
function createTooltip() {
    return d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("padding", "12px")
        .style("background", "rgba(0, 0, 0, 0.8)")
        .style("color", "white")
        .style("border-radius", "8px")
        .style("font-size", "14px")
        .style("font-family", "Arial, sans-serif")
        .style("pointer-events", "none")
        .style("opacity", 0)
        .style("z-index", 1000);
}

// initializing the map
async function initMap() {
    // Load airport data first
    await loadAirportData();
    
    if (airports.length === 0) {
        console.error("No airport data loaded");
        return;
    }

    const dimensions = getMapDimensions();
    currentWidth = dimensions.width;
    currentHeight = dimensions.height;

    svg = d3.select("#map")
        .attr("width", currentWidth)
        .attr("height", currentHeight);

    // creating a group for all map elements
    mapGroup = svg.append("g");

    // Create tooltip
    const tooltip = createTooltip();

    // setting up zoom behavior
    zoom = d3.zoom()
        .scaleExtent([0.5, 8])
        .on("zoom", function(event) {
            mapGroup.attr("transform", event.transform);
        });

    // applying zoom to the SVG
    svg.call(zoom);

    // loading Chile GeoJSON data
    d3.json("world.geojson")
        .then(function(world) {
            drawMap(world, tooltip);
            setupButtons();
        })
        .catch(function(error) {
            console.error("Error loading map data:", error);
        });
}

function drawMap(world, tooltip) {
    // finding Chile in the data
    const chile = world.features.find(d => 
        d.properties.name && d.properties.name.toLowerCase().includes('chile')
    );
    
    if (!chile) {
        console.error("Chile not found in the data");
        return;
    }

    // setting up projection with responsive dimensions
    projection = d3.geoMercator()
        .fitSize([currentWidth, currentHeight], chile);
    
    path = d3.geoPath().projection(projection);

    // clearing existing elements
    mapGroup.selectAll("*").remove();

    // draeing Chile outline
    mapGroup.append("path")
        .datum(chile)
        .attr("class", "country-outline")
        .attr("d", path);

    // setting up color scale using our interpolator
    const maxReduction = d3.max(airports, d => d.reduction_pct);
    const colorScale = d3.scaleSequential(t => createColorScale(t))
        .domain([0, 100]);

    // calculating responsive marker size
    const markerSize = Math.max(3, Math.min(6, currentWidth / 50));


    // drawing airports
    mapGroup.selectAll(".airport-marker")
        .data(airports)
        .enter()
        .append("circle")
        .attr("class", "airport-marker")
        .attr("cx", d => projection([d.lon, d.lat])[0])
        .attr("cy", d => projection([d.lon, d.lat])[1])
        .attr("r", markerSize)
        .attr("fill", d => colorScale(d.reduction_pct))
        .on("mouseover", function(event, d) {
            tooltip.transition()
                .duration(200)
                .style("opacity", .9);
            
            tooltip.html(`
                <strong>${d.codigo}</strong><br/>
                Se redujo de ${d.ops_2019.toLocaleString()} a ${d.ops_2020.toLocaleString()} operaciones<br/>
                <strong>Reducción de: ${d.reduction_pct.toFixed(1)}%</strong>
            `)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function(d) {
            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });

    // creating legend
    createLegend(svg, colorScale, maxReduction);
}

function setupButtons() {
    // zoom in button
    document.getElementById("zoom-in").addEventListener("click", function() {
        svg.transition().duration(300).call(
            zoom.scaleBy, 1.5
        );
    });

    // zoom out button
    document.getElementById("zoom-out").addEventListener("click", function() {
        svg.transition().duration(300).call(
            zoom.scaleBy, 1 / 1.5
        );
    });

    // Reset button
    document.getElementById("reset-zoom").addEventListener("click", function() {
        svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity
        );
    });
}

function createLegend(svg, colorScale, maxReduction) {
    const legendContainer = d3.select(".legend-scale");
    
    // clear any existing legend
    legendContainer.selectAll("*").remove();
    
    // getting the actual dimensions of the legend container
    const containerRect = legendContainer.node().getBoundingClientRect();
    const legendWidth = Math.max(120, containerRect.width);
    const legendHeight = Math.max(200, containerRect.height);
    
    // creating gradient definition using our custom color scale
    const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
    defs.select("#legend-gradient").remove();
    
    const gradient = defs.append("linearGradient")
        .attr("id", "legend-gradient")
        .attr("x1", "0%")
        .attr("y1", "100%")
        .attr("x2", "0%")
        .attr("y2", "0%");
    
    // creating smooth gradient stops using our high-contrast color scale
    const stops = d3.range(0, 101, 2); // frequent stops for smoother gradient
    stops.forEach(stop => {
        gradient.append("stop")
            .attr("offset", `${stop}%`)
            .attr("stop-color", createColorScale(stop / 100));
    });
    
    // legend SVG that fills the container
    const legendSvg = legendContainer
        .append("svg")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .attr("viewBox", `0 0 ${legendWidth} ${legendHeight}`)
        .attr("preserveAspectRatio", "xMidYMid meet");
    
    // calculating centered positions
    const rectWidth = 50; // Wider rectangle
    const rectHeight = legendHeight * 0.7; // Use 70% of available height
    const rectX = (legendWidth - rectWidth) / 2; // Center horizontally
    const rectY = (legendHeight - rectHeight) / 2; // Center vertically
    
    // gradient rectangle with clean styling for data viz
    legendSvg.append("rect")
        .attr("class", "legend-gradient-rect")
        .attr("x", rectX)
        .attr("y", rectY)
        .attr("width", rectWidth)
        .attr("height", rectHeight)
        .attr("rx", 8);
    
    // labels with contrast for glassmorphism
    const values = [0, 25, 50, 75, 100];
    const scale = d3.scaleLinear()
        .domain([0, 100])
        .range([rectY + rectHeight, rectY]);
    
    values.forEach(value => {
        const y = scale(value);
        
        legendSvg.append("text")
            .attr("class", "legend-label")
            .attr("x", rectX + rectWidth + 10)
            .attr("y", y + 5)
            .text(`${value}%`);
    });
}

// handling window resize
async function handleResize() {
    const dimensions = getMapDimensions();
    
    if (dimensions.width !== currentWidth || dimensions.height !== currentHeight) {
        currentWidth = dimensions.width;
        currentHeight = dimensions.height;
        
        svg.attr("width", currentWidth).attr("height", currentHeight);
        
        // reloading map data if available
        d3.json("world.geojson")
            .then(function(world) {
                const tooltip = d3.select(".tooltip");
                drawMap(world, tooltip);
            })
            .catch(function(error) {
                console.error("Error reloading map data:", error);
            });
    }
}

// init when page loads
document.addEventListener('DOMContentLoaded', initMap);

// adding resize listener with debouncing
let resizeTimer;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleResize, 250);
});