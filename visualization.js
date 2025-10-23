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

    // Add clip path to confine the drawing area, area does not overlap with y axis labels ;)
    svg.append("clipPath")
        .attr("id", "clip")
      .append("rect")
        .attr("width", width)
        .attr("height", height);

    // Parse dates and filter 2015 onwards
    const parseDate = d3.timeParse('%Y-%m-%d');
    const filtered = monthlyData.filter(d => {
        const year = parseInt(d.date_str.substring(0, 4));
        return year >= 2015;
    });
    filtered.forEach(d => {
        d.date = parseDate(d.date_str)
    });

    // Scales
    const x = d3.scaleTime()
        .domain(d3.extent(filtered, d => d.date))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(filtered, d => d.cnt_operaciones) * 1.1])
        .range([height, 0]);

    // Color function based on date
    const getColor = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        if (year < 2020) return '#4fc3f7';
        if (year === 2020 || (year === 2021 && month <= 6)) return '#ef5350';
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

    // Gradient
    const gradient = svg.append('defs')
        .append('linearGradient')
        .attr('id', 'area-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');

    gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#667eea')
        .attr('stop-opacity', 0.6);

    gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#667eea')
        .attr('stop-opacity', 0.1);

    // clippath to area
    const areaPath = svg.append('path')
        .datum(filtered)
        .attr('fill', 'url(#area-gradient)')
        .attr('d', area)
        .attr("clip-path", "url(#clip)");

    // Line
    const line = d3.line()
        .x(d => x(d.date))
        .y(d => y(d.cnt_operaciones))
        .curve(d3.curveMonotoneX);

    // clippath to line
    const linePath = svg.append('path')
        .datum(filtered)
        .attr('fill', 'none')
        .attr('stroke', '#667eea')
        .attr('stroke-width', 2)
        .attr('d', line)
        .attr("clip-path", "url(#clip)");

    // Axes groups for zoom funcion
    const xAxisGroup = svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat('%Y')))
        .selectAll('text')
        .attr('fill', '#a0a0a0');
    
    // separate selection:
    const xAxis = svg.select('.x-axis');

    const yAxis = svg.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(y).ticks(6).tickFormat(d => d >= 1000 ? `${(d/1000).toFixed(0)}k` : d))
        .selectAll('text')
        .attr('fill', '#a0a0a0');

    svg.selectAll('.domain, .tick line')
        .attr('stroke', '#2a2f4a');

    // Y-axis label
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -50)
        .attr('text-anchor', 'middle')
        .attr('fill', '#e0e0e0')
        .attr('font-size', '12px')
        .text('Operaciones Mensuales');

    // COVID marker clippath applied (tuve que quitar el texto)
    const covidDate = new Date('2020-03-01');
    svg.append('line')
        .attr('class', 'covid-line')
        .attr('x1', x(covidDate))
        .attr('x2', x(covidDate))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', '#ef5350')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5')
        .attr('opacity', 0.8)
        .attr("clip-path", "url(#clip)");

    svg.append('text')
        .attr('class', 'covid-text')
        .attr('x', x(covidDate))
        .attr('y', -5)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ef5350')
        .attr('font-size', '12px')
        .attr('font-weight', '600')
        .text('COVID-19')
        .attr("clip-path", "url(#clip)");

    // Tooltip
    const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background', '#222')
        .style('color', '#fff')
        .style('padding', '6px 10px')
        .style('border-radius', '4px')
        .style('pointer-events', 'none');

    //Matener interactive dots
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
            d3.select(this)
                .transition()
                .duration(200)
                .attr('opacity', 1)
                .attr('r', 6);

            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const monthName = months[d.date.getMonth()];

            tooltip.html(
                `<strong>${monthName} ${d.date.getFullYear()}</strong><br/>
                Operaciones: ${d.cnt_operaciones.toLocaleString()}
                `)
                .style('opacity', 1)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('opacity', 0)
                .attr('r', 4);
            tooltip.style('opacity', 0);
        });

    // Zoom behavior
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
        .lower(); // send behind other elements

    svg.call(zoom);

    function zoomed(event) {
        const transform = event.transform;
        const newX = transform.rescaleX(x);

        // Mover Axis respecto a zoom
        xAxis.call(d3.axisBottom(newX).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat('%Y')));

        // Mover raya COVID
        svg.select('line.covid-line')
            .attr('x1', newX(covidDate))
            .attr('x2', newX(covidDate));

        svg.select('text.covid-text')
            .attr('x', newX(covidDate));

        // Mover elementos para X
        linePath.attr('d', line.x(d => newX(d.date)));
        areaPath.attr('d', area.x(d => newX(d.date)));

        // Puntos posicion new
        svg.selectAll('.dot')
            .attr('cx', d => newX(d.date))
            .attr('cy', d => y(d.cnt_operaciones));
    }

    // Reset posicion
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
}

function renderComparisonBars(airports) {
    // Sort by 2019 volume and take top 20
    const airportsWithData = airports.filter(a => a.years[2019]);
    const top20 = airportsWithData
        .sort((a, b) => b.years[2019].operations - a.years[2019].operations)
        .slice(0, 20);
    
    const max2019 = d3.max(top20, a => a.years[2019].operations);
    
    // Render for each year
    [2015, 2019, 2020, 2024, 2025].forEach(year => {
        
        const container = d3.select(`#bars-${year}`);
        
        top20.forEach(airport => {
            const data = airport.years[year];
            
            if (!data) {
                // Show empty/no data bar
                const barDiv = container.append('div')
                    .attr('class', 'airport-bar');
                
                const label = barDiv.append('div')
                    .attr('class', 'airport-label');
                
                label.append('span')
                    .style('font-weight', '600')
                    .text(airport.oaci);
                
                label.append('span')
                    .style('color', '#555')
                    .style('font-size', '0.75rem')
                    .text('sin datos');
                
                barDiv.append('div')
                    .attr('class', 'bar-bg')
                    .append('div')
                    .attr('class', `bar-fill bar-${year}`)
                    .style('width', '0%')
                    .style('opacity', '0.3');
                
                return;
            }
            
            const pct = (data.operations / max2019) * 100;
            
            const barDiv = container.append('div')
                .attr('class', 'airport-bar');
            
            const label = barDiv.append('div')
                .attr('class', 'airport-label');
            
            label.append('span')
                .style('font-weight', '600')
                .text(airport.oaci);
            
            const rightLabel = label.append('span');
            rightLabel.append('span')
                .style('color', '#a0a0a0')
                .style('font-size', '0.8rem')
                .text(data.operations.toLocaleString());
            
            if (year !== 2019 && data.pct_of_2019) {
                rightLabel.append('span')
                    .style('margin-left', '8px')
                    .style('color', data.pct_of_2019 >= 100 ? '#66bb6a' : '#ffa726')
                    .style('font-weight', '600')
                    .text(`${data.pct_of_2019.toFixed(0)}%`);
            }
            
            const barBg = barDiv.append('div')
                .attr('class', 'bar-bg');
            
            barBg.append('div')
                .attr('class', `bar-fill bar-${year}`)
                .style('width', '0%')
                .transition()
                .duration(1000)
                .delay((i, j) => top20.indexOf(airport) * 30)
                .style('width', pct + '%');
        });
    });
}

// Initialize
init();