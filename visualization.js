// Load and visualize the data
async function init() {
    try {
        const data = await d3.json('aviation_data.json');
        
        // Calculate key statistics
        const stats = calculateStats(data);
        renderStats(stats);
        
        // Render timeline
        renderTimeline(data.monthly_total);
        
        // Render comparison bars
        renderComparisonBars(data.airports);
        
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

function calculateStats(data) {
    const monthly = data.monthly_total;
    
    // Find 2015 average
    const months_2015 = monthly.filter(d => d.date_str.startsWith('2015'));
    const avg_2015 = months_2015.length > 0 ? d3.mean(months_2015, d => d.cnt_operaciones) : null;
    
    // Find peak 2019 month
    const months_2019 = monthly.filter(d => d.date_str.startsWith('2019'));
    const avg_2019 = d3.mean(months_2019, d => d.cnt_operaciones);
    
    // Find lowest 2020 month  
    const months_2020 = monthly.filter(d => d.date_str.startsWith('2020'));
    const min_2020 = d3.min(months_2020, d => d.cnt_operaciones);
    
    // Latest month (2025)
    const latest = monthly[monthly.length - 1];
    
    // Calculate drops and recoveries
    const drop_pct = ((min_2020 / avg_2019 - 1) * 100).toFixed(1);
    const recovery_pct = ((latest.cnt_operaciones / avg_2019 - 1) * 100).toFixed(1);
    const growth_2015_2019 = avg_2015 ? (((avg_2019 / avg_2015 - 1) * 100).toFixed(1)) : null;
    
    return {
        avg_2015: avg_2015 ? Math.round(avg_2015) : null,
        avg_2019: Math.round(avg_2019),
        min_2020: Math.round(min_2020),
        latest: Math.round(latest.cnt_operaciones),
        drop_pct,
        recovery_pct,
        growth_2015_2019,
        latest_date: latest.date_str
    };
}

function renderStats(stats) {
    const container = d3.select('#stats');
    
    const statsData = [
        stats.avg_2015 ? {
            value: stats.avg_2015.toLocaleString(),
            label: 'Promedio mensual ops (2015)'
        } : null,
        stats.growth_2015_2019 ? {
            value: '+' + stats.growth_2015_2019 + '%',
            label: 'Crecimiento 2015-2019',
            color: '#4fc3f7'
        } : null,
        {
            value: stats.avg_2019.toLocaleString(),
            label: 'Promedio mensual ops (2019)'
        },
        {
            value: stats.drop_pct + '%',
            label: 'Colapso máximo (2020)',
            color: '#ef5350'
        },
        {
            value: stats.min_2020.toLocaleString(),
            label: 'Mínimo mensual ops (2020)'
        },
        {
            value: stats.recovery_pct + '%',
            label: `Recuperación vs 2019 (${stats.latest_date.substring(0, 7)})`,
            color: parseFloat(stats.recovery_pct) >= 0 ? '#66bb6a' : '#ffa726'
        }
    ].filter(s => s !== null);
    
    const cards = container.selectAll('.stat-card')
        .data(statsData)
        .enter()
        .append('div')
        .attr('class', 'stat-card');
    
    cards.append('div')
        .attr('class', 'stat-value')
        .style('color', d => d.color || '#667eea')
        .text(d => d.value);
    
    cards.append('div')
        .attr('class', 'stat-label')
        .text(d => d.label);
}

function renderTimeline(monthlyData) {
    const container = d3.select('#timeline');
    const margin = {top: 20, right: 30, bottom: 40, left: 70};
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    container.selectAll('*').remove();

    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    //Sound configuration
    let soundEnabled = false;

    const soundPre2020 = new Audio('sounds/crowd.mp3');
    const soundCovid = new Audio('sounds/cough.mp3');
    const soundPost2021 = new Audio('sounds/takeoff.mp3');
    const soundZoomRange = new Audio('sounds/zoosound.mp3');


    let currentSound = null;

    function getSoundForDate(date) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        if (year < 2020) return soundPre2020;
        if (year === 2020 || (year === 2021 && month <= 6)) return soundCovid;
        return soundPost2021;
    }

    const soundButton = container.append('button')
        .text('🔇 Enable Sound')
        .style('margin', '8px')
        .style('padding', '6px 12px')
        .style('font-size', '14px')
        .style('cursor', 'pointer')
        .on('click', async () => {
            if (!soundEnabled) {
                soundEnabled = true;
                soundButton.text('🔊 Sound Enabled');
                try {
                    await Promise.all([
                        soundPre2020.play().then(() => soundPre2020.pause()),
                        soundCovid.play().then(() => soundCovid.pause()),
                        soundPost2021.play().then(() => soundPost2021.pause())
                    ]);
                } catch (err) {
                    console.warn('Autoplay unlock skipped:', err);
                }
            } else {
                soundEnabled = false;
                soundButton.text('🔇 Enable Sound');
                [soundPre2020, soundCovid, soundPost2021].forEach(a => {
                    a.pause();
                    a.currentTime = 0;
                });
            }
        });

    // Add clip path
    svg.append("clipPath")
        .attr("id", "clip")
      .append("rect")
        .attr("width", width)
        .attr("height", height);

    //Fechas
    const parseDate = d3.timeParse('%Y-%m-%d');
    const filtered = monthlyData.filter(d => parseInt(d.date_str.substring(0, 4)) >= 2015);
    filtered.forEach(d => d.date = parseDate(d.date_str));

    //Escalas
    const x = d3.scaleTime()
        .domain(d3.extent(filtered, d => d.date))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(filtered, d => d.cnt_operaciones) * 1.1])
        .range([height, 0]);

    //Funcion paa dar colores a los puntos
    const getColor = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        if (year < 2020 || (year === 2020 && month <= 2)) return '#4fc3f7';
        if (year === 2020 || (year === 2021 && month <= 6 && month > 2)) return '#ef5350';
        return '#66bb6a';
    };

    // Add grid
    svg.append('g')
        .attr('class', 'grid')
        .attr('opacity', 0.1)
        .call(d3.axisLeft(y)
            .tickSize(-width)
            .tickFormat('')
        );

    // Area chart
    const area = d3.area()
        .x(d => x(d.date))
        .y0(height)
        .y1(d => y(d.cnt_operaciones))
        .curve(d3.curveMonotoneX);

    //Gradiente
    const gradient = svg.append('defs')
        .append('linearGradient')
        .attr('id', 'area-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');

    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#667eea').attr('stop-opacity', 0.6);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#667eea').attr('stop-opacity', 0.1);

    //Clippath al area
    const areaPath = svg.append('path')
        .datum(filtered)
        .attr('fill', 'url(#area-gradient)')
        .attr('d', area)
        .attr("clip-path", "url(#clip)");

    //Linea
    const line = d3.line()
        .x(d => x(d.date))
        .y(d => y(d.cnt_operaciones))
        .curve(d3.curveMonotoneX);

    //Clippath a Linea
    const linePath = svg.append('path')
        .datum(filtered)
        .attr('fill', 'none')
        .attr('stroke', '#667eea')
        .attr('stroke-width', 2)
        .attr('d', line)
        .attr("clip-path", "url(#clip)");

    //Ejes funcion zoom
    const xAxisGroup = svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat('%Y')))
        .selectAll('text')
        .attr('fill', '#a0a0a0');

    const xAxis = svg.select('.x-axis');
    const yAxis = svg.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(y).ticks(6).tickFormat(d => d >= 1000 ? `${(d/1000).toFixed(0)}k` : d))
        .selectAll('text')
        .attr('fill', '#a0a0a0');

    svg.selectAll('.domain, .tick line').attr('stroke', '#2a2f4a');

    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -50)
        .attr('text-anchor', 'middle')
        .attr('fill', '#e0e0e0')
        .attr('font-size', '12px')
        .text('Operaciones Mensuales');

    // Nueva paleta de colores para daltoicos OkabeIto
    const okabeIto = [
        "#E69F00", "#56B4E9", "#009E73", "#F0E442",
        "#0072B2", "#D55E00", "#CC79A7", "#000000"
    ];

    // Eventos para linea de tempo
    const events = [
        { date: new Date('2020-01-01'), label: 'Mayor numero de operaciones PrePandemia', color: okabeIto[0] },
        { date: new Date('2020-03-01'), label: 'COVID-19 llega a Chile', color: okabeIto[5] },
        { date: new Date('2020-03-18'), label: 'Cierre Fronteras Aereas', color: okabeIto[4] },
        { date: new Date('2021-03-24'), label: 'Primera docis de vacunas para el publico general', color: okabeIto[2] },
        { date: new Date('2023-08-31'), label: 'Fin Emergencia Sanitaria', color: okabeIto[1] },
        { date: new Date('2024-01-01'), label: 'Mayor numero de operaciones PostPandemia', color: okabeIto[6] }
    ];

    // Tooltips
    const eventTooltip = d3.select('body')
        .append('div')
        .attr('class', 'tooltip-event')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background', '#222')
        .style('color', '#fff')
        .style('padding', '6px 10px')
        .style('border-radius', '4px')
        .style('pointer-events', 'none');

    // Lineas de eventps
    const eventLines = svg.selectAll('.event-line')
        .data(events)
        .enter()
        .append('line')
        .attr('class', 'event-line')
        .attr('x1', d => x(d.date))
        .attr('x2', d => x(d.date))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', d => d.color)
        .attr('stroke-width', 3)
        .attr('stroke-dasharray', '5,5')
        .attr('opacity', 0.8)
        .attr('clip-path', 'url(#clip)')
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this).attr('stroke-width', 4).attr('opacity', 1);
            eventTooltip
                .style('opacity', 1)
                .html(`<strong>${d.label}</strong>`)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this).attr('stroke-width', 3).attr('opacity', 0.8);
            eventTooltip.style('opacity', 0);
        });

    //Mantener interactive dots
    const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background', '#222')
        .style('color', '#fff')
        .style('padding', '6px 10px')
        .style('border-radius', '4px')
        .style('pointer-events', 'none');

    svg.selectAll('.dot')
        .data(filtered)
        .enter()
        .append('circle')
        .attr('class', 'dot')
        .attr('cx', d => x(d.date))
        .attr('cy', d => y(d.cnt_operaciones))
        .attr('r', 4)
        .attr('fill', d => getColor(d.date))
        .attr('opacity', 0)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .attr("clip-path", "url(#clip)")
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this).transition().duration(200).attr('opacity', 1).attr('r', 6);
            if (soundEnabled) {
                const sound = getSoundForDate(d.date);
                if (currentSound && !currentSound.paused) {
                    currentSound.pause(); currentSound.currentTime = 0;
                }
                currentSound = sound; currentSound.currentTime = 0; currentSound.volume = 0.25;
                currentSound.play().catch(err => console.warn('Sound play prevented:', err));
            }
            const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            tooltip.html(`<strong>${months[d.date.getMonth()]} ${d.date.getFullYear()}</strong><br/>
                          Operaciones: ${d.cnt_operaciones.toLocaleString()}`)
                .style('opacity', 1)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this).transition().duration(200).attr('opacity', 0).attr('r', 4);
            tooltip.style('opacity', 0);
        });

    // Acciones de zoom
    const zoom = d3.zoom()
        .scaleExtent([1, 20])
        .translateExtent([[0, 0], [width, height]])
        .extent([[0, 0], [width, height]])
        .on('zoom', zoomed);

    svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .style('fill', 'none')
        .style('pointer-events', 'all')
        .lower();

    svg.call(zoom);

    function zoomed(event) {
        const transform = event.transform;
        const newX = transform.rescaleX(x);
        xAxis.call(d3.axisBottom(newX).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat('%Y')));

        linePath.attr('d', line.x(d => newX(d.date)));
        areaPath.attr('d', area.x(d => newX(d.date)));

        svg.selectAll('.dot')
            .attr('cx', d => newX(d.date))
            .attr('cy', d => y(d.cnt_operaciones));

        // Movimiento lineas de tiempo con zoo
        svg.selectAll('.event-line')
            .attr('x1', d => newX(d.date))
            .attr('x2', d => newX(d.date));
    }

    container.append('button')
        .text('Reset Zoom')
        .style('margin-top', '10px')
        .style('padding', '6px 12px')
        .style('font-size', '14px')
        .style('cursor', 'pointer')
        .on('click', () => {
            svg.transition().duration(750).call(
                zoom.transform,
                d3.zoomIdentity,
                d3.zoomTransform(svg.node()).invert([width / 2, height / 2])
            );
        });

        window.zoomToRange = function(startYear, endYear) {

            const start = new Date(startYear, 0, 1);
            const end = new Date(endYear, 11, 31);
            
            if (startYear > 2025 || startYear < 2015 || endYear > 2025 || endYear < 2015 ) {
                console.warn("Años fuera de la escala:", startYear, endYear);
                return;
            }

            const newScale = width / (x(end) - x(start));

            const tx = -x(start) * newScale;

            const t = d3.zoomIdentity
                .translate(tx, 0)
                .scale(newScale);

            svg.transition()
                .duration(1000)
                .call(zoom.transform, t);
            
            if (soundEnabled) {
                try {
                    soundZoomRange.currentTime = 0;
                    soundZoomRange.volume = 0.4;
                    soundZoomRange.play();
                } catch(err) {
                    console.warn("ZoomRange sound prevented:", err);
                }
            }
        };
}


function renderComparisonBars(airports) {
    // Paleta para daltonikos Okabe Ito
    const okabeIto = {
        2015: "#E69F00", // naranja
        2019: "#56B4E9", // azul
        2020: "#D55E00", // rojo
        2024: "#009E73", // verde
        2025: "#CC79A7"  // magenta
    };

    // Tooltip
    const tooltip = d3.select("body")
        .append("div")
        .attr("class", "tooltip-bar")
        .style("opacity", 0)
        .style("position", "absolute")
        .style("background", "#222")
        .style("color", "#fff")
        .style("padding", "6px 10px")
        .style("border-radius", "4px")
        .style("font-size", "0.8rem")
        .style("pointer-events", "none");

    // Sort by 2019 volume and take top 20
    const airportsWithData = airports.filter(a => a.years[2019]);
    const top20 = airportsWithData
        .sort((a, b) => b.years[2019].operations - a.years[2019].operations)
        .slice(0, 20);

    const max2019 = d3.max(top20, a => a.years[2019].operations);

    // Render for year
    [2015, 2019, 2020, 2024, 2025].forEach(year => {

        const container = d3.select(`#bars-${year}`);

        container.selectAll('*').remove();

        top20.forEach(airport => {
            const data = airport.years[year];

            const barDiv = container.append("div").attr("class", "airport-bar");

            const label = barDiv.append("div").attr("class", "airport-label");
            label.append("span")
                .style("font-weight", "600")
                .text(airport.oaci);

            const rightLabel = label.append("span");

            if (!data) {
                rightLabel.append("span")
                    .style("color", "#777")
                    .style("font-size", "0.75rem")
                    .text("sin datos");
                barDiv.append("div")
                    .attr("class", "bar-bg")
                    .append("div")
                    .attr("class", `bar-fill bar-${year}`)
                    .style("background-color", "#555")
                    .style("width", "0%")
                    .style("opacity", "0.3");
                return;
            }

            const pct = (data.operations / max2019) * 100;
            const pctText = data.pct_of_2019 ? `${data.pct_of_2019.toFixed(0)}%` : "";

            rightLabel.append("span")
                .style("color", "#a0a0a0")
                .style("font-size", "0.8rem")
                .text(data.operations.toLocaleString());

            if (year !== 2019 && data.pct_of_2019) {
                rightLabel.append("span")
                    .style("margin-left", "8px")
                    .style("color", data.pct_of_2019 >= 100 ? "#66bb6a" : "#ffa726")
                    .style("font-weight", "600")
                    .text(pctText);
            }
            //Inento de hacerlo mas agradeble a la vista y contexto
            const barBg = barDiv.append("div").attr("class", "bar-bg");

            const barFill = barBg.append("div")
                .attr("class", `bar-fill bar-${year}`)
                .style("background-color", okabeIto[year] || "#999")
                .style("width", "0%")
                .style("cursor", "pointer")
                .on("mouseover", function (event) {
                    d3.select(this)
                        .transition().duration(200)
                        .style("opacity", 1)
                        .style("transform", "scaleY(1.1)");

                    tooltip.transition().duration(200).style("opacity", 1);
                    tooltip.html(`
                        <strong>${airport.oaci}</strong><br/>
                        <span style="color:${okabeIto[year]}">${year}</span><br/>
                        Operaciones: ${data.operations.toLocaleString()}<br/>
                        ${data.pct_of_2019 ? `(${data.pct_of_2019.toFixed(1)}% de 2019)` : ""}
                    `)
                        .style("left", (event.pageX + 12) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mousemove", function (event) {
                    tooltip.style("left", (event.pageX + 12) + "px")
                           .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", function () {
                    d3.select(this)
                        .transition().duration(200)
                        .style("opacity", 0.85)
                        .style("transform", "scaleY(1)");
                    tooltip.transition().duration(200).style("opacity", 0);
                });

            // Animación de llenado por experimentar
            barFill.transition()
                .duration(1000)
                .delay(top20.indexOf(airport) * 30)
                .style("width", pct + "%")
                .style("opacity", 0.85);
        });
    });
}

// Initialize
init();