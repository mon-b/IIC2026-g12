// Configuration
const config = {
    margin: { top: 40, right: 40, bottom: 60, left: 80 }
};

let bubbleData = [];
let svg, chartGroup, currentWidth, currentHeight;

// Load and process the two CSV files
async function loadData() {
    try {
        // Load both CSVs in parallel
        const [operacionesData, metadatosData] = await Promise.all([
            d3.csv("operaciones-aeropuertos.csv"),
            d3.csv("metadatos_aeropuertos.csv")
        ]);
        
        console.log(`Loaded ${operacionesData.length} operation records`);
        console.log(`Loaded ${metadatosData.length} airports`);
        
        // Filter to last 10 years (201511 onwards)
        const filteredOps = operacionesData.filter(d => +d.mes_id >= 201511);
        console.log(`Filtered to ${filteredOps.length} records from 2015-11 onwards`);
        
        // Create metadata lookup
        const metadataMap = new Map();
        metadatosData.forEach(d => {
            metadataMap.set(d.OACI, {
                nombre: d.Nombre,
                ciudad: d.Ciudad,
                region: d.Region,
                tipo: d.Tipo,
                iata: d.IATA
            });
        });
        
        // Group by year only - aggregate all airports
        const opsByYear = d3.rollup(
            filteredOps,
            v => ({
                operations: d3.sum(v, d => +d.cnt_operaciones),
                airports: new Set(v.map(d => d.aeropuerto_oaci)).size
            }),
            d => Math.floor(+d.mes_id / 100) // Extract year from YYYYMM
        );
        
        // Create data points: one per year
        bubbleData = [];
        opsByYear.forEach((data, year) => {
            if (year >= 2016 && year <= 2024) {
                bubbleData.push({
                    year: year,
                    operations: data.operations,
                    airports: data.airports
                });
            }
        });
        
        console.log(`Created ${bubbleData.length} data points (one per year)`);
        console.log('Sample:', bubbleData[0]);
        
        return bubbleData;
    } catch (error) {
        console.error("Error loading data:", error);
        return [];
    }
}

// Get responsive dimensions
function getChartDimensions() {
    const container = document.querySelector('.map-container');
    const containerWidth = container.clientWidth - 40;
    
    return {
        width: Math.max(400, Math.min(containerWidth, 800)),
        height: Math.max(350, Math.min(window.innerHeight * 0.5, 500))
    };
}

// Create tooltip
function createTooltip() {
    return d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);
}

// Initialize the chart
async function initChart() {
    // Load data
    await loadData();
    
    if (bubbleData.length === 0) {
        console.error("No data loaded");
        return;
    }
    
    const dimensions = getChartDimensions();
    currentWidth = dimensions.width;
    currentHeight = dimensions.height;
    
    // Create SVG
    svg = d3.select("#map")
        .attr("width", currentWidth + config.margin.left + config.margin.right)
        .attr("height", currentHeight + config.margin.top + config.margin.bottom);
    
    chartGroup = svg.append("g")
        .attr("transform", `translate(${config.margin.left},${config.margin.top})`);
    
    // Create tooltip
    const tooltip = createTooltip();
    
    // Draw the chart
    drawChart(tooltip);
    
    // Setup controls
    setupControls();
}

function drawChart(tooltip) {
    // Clear existing content
    chartGroup.selectAll("*").remove();
    
    // Create scales
    const xScale = d3.scaleLinear()
        .domain([2016, 2024])
        .range([0, currentWidth]);
    
    const maxOps = d3.max(bubbleData, d => d.operations);
    const yScale = d3.scaleLinear()
        .domain([0, maxOps * 1.1])
        .range([currentHeight, 0]);
    
    // Bubble size scale - based on operations volume
    const sizeScale = d3.scaleSqrt()
        .domain([0, maxOps])
        .range([15, 60]);
    
    // Color scale based on year (pre-COVID, COVID, post-COVID)
    const colorScale = d3.scaleOrdinal()
        .domain([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024])
        .range(['#4fc3f7', '#42a5f5', '#2196f3', '#1976d2', '#ef5350', '#f44336', '#ffa726', '#66bb6a', '#4caf50']);
    
    // Add grid lines
    chartGroup.append("g")
        .attr("class", "grid")
        .attr("opacity", 0.1)
        .call(d3.axisLeft(yScale)
            .tickSize(-currentWidth)
            .tickFormat("")
        )
        .selectAll("line")
        .attr("stroke", "white");
    
    // X axis
    const xAxis = d3.axisBottom(xScale)
        .tickFormat(d3.format("d"))
        .ticks(9);
    
    chartGroup.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${currentHeight})`)
        .call(xAxis)
        .selectAll("text")
        .attr("fill", "rgba(255, 255, 255, 0.9)")
        .attr("font-size", "12px");
    
    chartGroup.selectAll(".x-axis line, .x-axis path")
        .attr("stroke", "rgba(255, 255, 255, 0.4)");
    
    // Y axis
    const yAxis = d3.axisLeft(yScale)
        .ticks(6)
        .tickFormat(d => d >= 1000 ? `${(d/1000).toFixed(0)}k` : d);
    
    chartGroup.append("g")
        .attr("class", "y-axis")
        .call(yAxis)
        .selectAll("text")
        .attr("fill", "rgba(255, 255, 255, 0.9)")
        .attr("font-size", "12px");
    
    chartGroup.selectAll(".y-axis line, .y-axis path")
        .attr("stroke", "rgba(255, 255, 255, 0.4)");
    
    // X axis label
    chartGroup.append("text")
        .attr("class", "axis-label")
        .attr("x", currentWidth / 2)
        .attr("y", currentHeight + 50)
        .attr("text-anchor", "middle")
        .attr("fill", "rgba(255, 255, 255, 0.95)")
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .text("Año");
    
    // Y axis label
    chartGroup.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -currentHeight / 2)
        .attr("y", -60)
        .attr("text-anchor", "middle")
        .attr("fill", "rgba(255, 255, 255, 0.95)")
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .text("Operaciones Anuales");
    
    // Add COVID marker
    chartGroup.append("line")
        .attr("x1", xScale(2020))
        .attr("x2", xScale(2020))
        .attr("y1", 0)
        .attr("y2", currentHeight)
        .attr("stroke", "rgba(255, 100, 100, 0.5)")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");
    
    chartGroup.append("text")
        .attr("x", xScale(2020))
        .attr("y", -10)
        .attr("text-anchor", "middle")
        .attr("fill", "rgba(255, 255, 255, 0.8)")
        .attr("font-size", "11px")
        .attr("font-weight", "600")
        .text("COVID-19");
    
    // Draw bubbles
    const bubbles = chartGroup.selectAll(".bubble")
        .data(bubbleData)
        .enter()
        .append("circle")
        .attr("class", "bubble")
        .attr("cx", d => xScale(d.year))
        .attr("cy", d => yScale(d.operations))
        .attr("r", d => sizeScale(d.operations))
        .attr("fill", d => colorScale(d.year))
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.75)
        .style("cursor", "pointer")
        .on("mouseover", function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("opacity", 1)
                .attr("stroke-width", 2)
                .attr("stroke", "#fff");
            
            tooltip.html(`
                <div class="tooltip-content">
                    <div class="tooltip-airport">
                        Año ${d.year}
                    </div>
                    <div class="tooltip-ops">
                        <span>Operaciones totales:</span>
                        <span class="tooltip-ops-value">${d.operations.toLocaleString()}</span>
                    </div>
                    <div class="tooltip-ops">
                        <span>Aeropuertos activos:</span>
                        <span class="tooltip-ops-value">${d.airports}</span>
                    </div>
                </div>
            `);
            
            const tooltipWidth = 240;
            const leftPosition = Math.max(10, event.pageX - tooltipWidth - 10);
            
            tooltip.style("opacity", 0)
                .style("visibility", "visible")
                .style("left", leftPosition + "px")
                .style("top", "0px");
            
            const actualHeight = tooltip.node().offsetHeight;
            let topPosition;
            if (event.pageY + actualHeight + 20 > window.innerHeight) {
                topPosition = Math.max(10, event.pageY - actualHeight - 10);
            } else {
                topPosition = event.pageY + 15;
            }
            
            tooltip.style("top", topPosition + "px")
                .transition()
                .duration(200)
                .style("opacity", 0.9);
        })
        .on("mouseout", function() {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("opacity", 0.75)
                .attr("stroke-width", 0.5)
                .attr("stroke", "#fff");
            
            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });
    
    // Create legend
    createLegend(colorScale);
}

function setupControls() {
    // Reset button
    document.getElementById("reset-zoom").addEventListener("click", function() {
        drawChart(d3.select(".tooltip"));
    });
    
    // Hide zoom in/out buttons (not needed for this chart)
    document.getElementById("zoom-in").style.display = "none";
    document.getElementById("zoom-out").style.display = "none";
}

function createLegend(colorScale) {
    const legendContainer = d3.select(".legend-scale");
    legendContainer.selectAll("*").remove();
    
    // Update legend title
    d3.select(".legend h3")
        .text("Periodo");
    
    const legendData = [
        { label: "Pre-COVID (2016-2019)", years: [2016, 2017, 2018, 2019] },
        { label: "COVID (2020-2021)", years: [2020, 2021] },
        { label: "Post-COVID (2022-2024)", years: [2022, 2023, 2024] }
    ];
    
    const legendSvg = legendContainer
        .append("svg")
        .attr("width", 250)
        .attr("height", 200);
    
    let yPos = 20;
    legendData.forEach(period => {
        // Period label
        legendSvg.append("text")
            .attr("x", 10)
            .attr("y", yPos)
            .attr("fill", "rgba(255, 255, 255, 0.95)")
            .attr("font-size", "13px")
            .attr("font-weight", "600")
            .text(period.label);
        
        yPos += 20;
        
        // Year circles
        period.years.forEach((year, i) => {
            legendSvg.append("circle")
                .attr("cx", 20 + i * 35)
                .attr("cy", yPos)
                .attr("r", 6)
                .attr("fill", colorScale(year))
                .attr("stroke", "#fff")
                .attr("stroke-width", 1);
            
            legendSvg.append("text")
                .attr("x", 20 + i * 35)
                .attr("y", yPos + 20)
                .attr("text-anchor", "middle")
                .attr("fill", "rgba(255, 255, 255, 0.9)")
                .attr("font-size", "10px")
                .text(year);
        });
        
        yPos += 45;
    });
}

// Handle window resize
async function handleResize() {
    const dimensions = getChartDimensions();
    
    if (dimensions.width !== currentWidth || dimensions.height !== currentHeight) {
        currentWidth = dimensions.width;
        currentHeight = dimensions.height;
        
        svg.attr("width", currentWidth + config.margin.left + config.margin.right)
            .attr("height", currentHeight + config.margin.top + config.margin.bottom);
        
        const tooltip = d3.select(".tooltip");
        drawChart(tooltip);
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initChart);

// Add resize listener with debouncing
let resizeTimer;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleResize, 250);
});