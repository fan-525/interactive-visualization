/**
 * Global Development Explorer
 * Interactive visualization of world development data (1960-2023)
 * Built with D3.js v7
 */

// ===== Global State =====
const state = {
  currentYearIndex: 13, // index into years array (2023)
  playing: false,
  playInterval: null,
  playSpeed: 1000, // ms per frame
  selectedCountries: new Set(),
  activeContinents: new Set(['Asia', 'Europe', 'Americas', 'Africa', 'Oceania']),
  xMetric: 'gdp',
  yMetric: 'lifeExp',
  sizeMetric: 'population',
  barMetric: 'population',
  data: null,
  countries: null,
  years: null,
  annotations: null,
};

// Continent colors
const continentColors = {
  Asia: '#e74c3c',
  Europe: '#3498db',
  Americas: '#2ecc71',
  Africa: '#f39c12',
  Oceania: '#9b59b6',
};

const continentNames = {
  Asia: '亚洲',
  Europe: '欧洲',
  Americas: '美洲',
  Africa: '非洲',
  Oceania: '大洋洲',
};

const metricLabels = {
  gdp: '人均GDP（美元）',
  lifeExp: '预期寿命（年）',
  population: '人口',
  co2: 'CO₂排放量（公吨）',
};

const countryNameCN = {
  'China': '中国', 'India': '印度', 'Japan': '日本', 'South Korea': '韩国',
  'Indonesia': '印度尼西亚', 'Thailand': '泰国', 'Vietnam': '越南', 'Philippines': '菲律宾',
  'Malaysia': '马来西亚', 'Pakistan': '巴基斯坦', 'Bangladesh': '孟加拉国', 'Saudi Arabia': '沙特阿拉伯',
  'United States': '美国', 'Canada': '加拿大', 'Brazil': '巴西', 'Mexico': '墨西哥',
  'Argentina': '阿根廷', 'Colombia': '哥伦比亚', 'Chile': '智利', 'Peru': '秘鲁',
  'Germany': '德国', 'France': '法国', 'United Kingdom': '英国', 'Italy': '意大利',
  'Spain': '西班牙', 'Russia': '俄罗斯', 'Poland': '波兰', 'Netherlands': '荷兰',
  'Sweden': '瑞典', 'Turkey': '土耳其',
  'Nigeria': '尼日利亚', 'South Africa': '南非', 'Egypt': '埃及', 'Kenya': '肯尼亚',
  'Ethiopia': '埃塞俄比亚', 'Ghana': '加纳', 'Tanzania': '坦桑尼亚', 'Morocco': '摩洛哥',
  'Australia': '澳大利亚', 'New Zealand': '新西兰'
};

const metricFormats = {
  gdp: d => d ? `$${d.toLocaleString()}` : '暂无',
  lifeExp: d => d ? `${d.toFixed(1)} 年` : '暂无',
  population: d => d ? formatPopulation(d) : '暂无',
  co2: d => d ? `${d.toLocaleString()} 公吨` : '暂无',
};

function formatPopulation(d) {
  if (d >= 1e9) return (d / 1e9).toFixed(2) + 'B';
  if (d >= 1e6) return (d / 1e6).toFixed(1) + 'M';
  if (d >= 1e3) return (d / 1e3).toFixed(0) + 'K';
  return d.toString();
}

// Helper to determine scale unit for axis display
function getScaleUnit(maxVal) {
  if (maxVal >= 1e12) return { power: 12, label: '×10¹²', divisor: 1e12 };
  if (maxVal >= 1e9) return { power: 9, label: '×10⁹', divisor: 1e9 };
  if (maxVal >= 1e6) return { power: 6, label: '×10⁶', divisor: 1e6 };
  if (maxVal >= 1e3) return { power: 3, label: '×10³', divisor: 1e3 };
  return { power: 0, label: '', divisor: 1 };
}

// Get current x-axis scale unit for zoom
let currentXScaleUnit = { power: 0, label: '', divisor: 1 };

// ===== Data Loading =====
async function loadData() {
  try {
    const response = await fetch('data/gapminder.json');
    const json = await response.json();
    state.data = json.data;
    state.countries = json.countries;
    state.years = json.years;
    state.annotations = json.annotations;
    return true;
  } catch (error) {
    console.error('Error loading data:', error);
    return false;
  }
}

// Get data for a specific country at current year
function getCountryData(iso) {
  const yearIndex = state.currentYearIndex;
  const d = state.data[iso];
  if (!d) return null;
  return {
    iso,
    gdp: d.gdp[yearIndex],
    lifeExp: d.lifeExp[yearIndex],
    population: d.population[yearIndex],
    co2: d.co2[yearIndex],
  };
}

// Get all country data for current year
function getCurrentYearData() {
  return state.countries
    .map(c => {
      const d = getCountryData(c.iso);
      if (!d || d.gdp === null || d.lifeExp === null) return null;
      return { ...c, ...d };
    })
    .filter(d => d !== null && state.activeContinents.has(d.continent));
}

// ===== Chart Dimensions =====
function getBubbleChartDimensions() {
  const container = document.getElementById('bubble-chart-container');
  const rect = container.getBoundingClientRect();
  const margin = { top: 30, right: 30, bottom: 60, left: 70 };
  const width = rect.width - margin.left - margin.right;
  const height = rect.height - margin.top - margin.bottom;
  return { margin, width, height };
}

function getBarChartDimensions() {
  const container = document.getElementById('bar-chart-container');
  const rect = container.getBoundingClientRect();
  const margin = { top: 20, right: 20, bottom: 60, left: 90 };
  const width = rect.width - margin.left - margin.right;
  const height = rect.height - margin.top - margin.bottom;
  return { margin, width, height };
}

// ===== Bubble Chart =====
let bubbleSvg, bubbleG, bubbleXScale, bubbleYScale, bubbleSizeScale, bubbleZoom;

function initBubbleChart() {
  const { margin, width, height } = getBubbleChartDimensions();

  bubbleSvg = d3.select('#bubble-chart-container')
    .append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

  // Defs for gradients
  const defs = bubbleSvg.append('defs');

  // Glow filter
  const filter = defs.append('filter').attr('id', 'glow');
  filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
  const feMerge = filter.append('feMerge');
  feMerge.append('feMergeNode').attr('in', 'coloredBlur');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Clipping path
  defs.append('clipPath').attr('id', 'bubble-clip')
    .append('rect').attr('width', width).attr('height', height);

  bubbleG = bubbleSvg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Create scales
  bubbleXScale = d3.scaleLinear().range([0, width]).clamp(true);
  bubbleYScale = d3.scaleLinear().range([height, 0]);
  bubbleSizeScale = d3.scaleSqrt().range([4, 50]);

  // Grid groups
  bubbleG.append('g').attr('class', 'grid grid-x');
  bubbleG.append('g').attr('class', 'grid grid-y');

  // Axes groups
  bubbleG.append('g').attr('class', 'axis axis-x').attr('transform', `translate(0,${height})`);
  bubbleG.append('g').attr('class', 'axis axis-y');

  // Axis labels
  bubbleSvg.append('text').attr('class', 'axis-label x-label')
    .attr('text-anchor', 'middle')
    .attr('fill', '#8892a8')
    .attr('font-size', '13px');

  bubbleSvg.append('text').attr('class', 'axis-label y-label')
    .attr('text-anchor', 'middle')
    .attr('fill', '#8892a8')
    .attr('font-size', '13px');

  // Bubbles group (clipped)
  const bubblesGroup = bubbleG.append('g').attr('class', 'bubbles-group')
    .attr('clip-path', 'url(#bubble-clip)');

  // Bubbles container
  bubblesGroup.append('g').attr('class', 'bubbles');

  // Zoom
  bubbleZoom = d3.zoom()
    .scaleExtent([0.5, 8])
    .extent([[0, 0], [width, height]])
    .on('zoom', onZoom);

  bubbleSvg.call(bubbleZoom);

  // Zoom controls overlay - disable default double-click zoom
  bubbleSvg.on('dblclick.zoom', null);

  // Legend
  drawLegend();
}

function updateBubbleScales() {
  const { width, height } = getBubbleChartDimensions();

  const allData = state.countries
    .map(c => {
      const d = getCountryData(c.iso);
      if (!d || d[state.xMetric] === null || d[state.yMetric] === null) return null;
      return { ...c, ...d };
    })
    .filter(d => d !== null);

  // Switch scale type based on metric
  if (state.xMetric === 'gdp' || state.xMetric === 'co2') {
    bubbleXScale = d3.scaleLog().range([0, width]).clamp(true);
  } else {
    bubbleXScale = d3.scaleLinear().range([0, width]).clamp(true);
  }

  const xExtent = d3.extent(allData, d => d[state.xMetric]);
  const yExtent = d3.extent(allData, d => d[state.yMetric]);

  if (state.xMetric === 'gdp' || state.xMetric === 'co2') {
    bubbleXScale.domain([Math.max(10, xExtent[0] * 0.5), xExtent[1] * 2]);
  } else {
    bubbleXScale.domain([0, xExtent[1] * 1.1]);
  }
  bubbleYScale.domain([Math.max(0, yExtent[0] - 5), yExtent[1] + 3]);
  bubbleSizeScale.domain([0, d3.max(allData, d => d.population)]);
}

function updateBubbleChart(animate = true) {
  const { margin, width, height } = getBubbleChartDimensions();
  const data = getCurrentYearData();

  updateBubbleScales();

  // Determine x-axis formatting
  let xAxis, yAxis;
  const xMax = bubbleXScale.domain()[1];
  if (state.xMetric === 'gdp' || state.xMetric === 'co2') {
    xAxis = d3.axisBottom(bubbleXScale).ticks(8, state.xMetric === 'gdp' ? '$,.0f' : ',.0f');
    currentXScaleUnit = { power: 0, label: '', divisor: 1 };
  } else if (state.xMetric === 'population') {
    currentXScaleUnit = getScaleUnit(xMax);
    const unit = currentXScaleUnit;
    if (unit.power > 0) {
      const decimals = unit.power >= 6 ? 1 : 0;
      xAxis = d3.axisBottom(bubbleXScale).ticks(8).tickFormat(d => (d / unit.divisor).toFixed(decimals));
    } else {
      xAxis = d3.axisBottom(bubbleXScale).ticks(8);
    }
  } else {
    xAxis = d3.axisBottom(bubbleXScale).ticks(8);
    currentXScaleUnit = { power: 0, label: '', divisor: 1 };
  }
  yAxis = d3.axisLeft(bubbleYScale).ticks(8);

  bubbleG.select('.axis-x').transition().duration(animate ? 500 : 0).call(xAxis);
  bubbleG.select('.axis-y').transition().duration(animate ? 500 : 0).call(yAxis);

  // Grid
  bubbleG.select('.grid-x')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(bubbleXScale).ticks(8).tickSize(-height).tickFormat(''));
  bubbleG.select('.grid-y')
    .call(d3.axisLeft(bubbleYScale).ticks(8).tickSize(-width).tickFormat(''));

  // Axis labels
  const xLabelText = metricLabels[state.xMetric] + (currentXScaleUnit.label ? `（${currentXScaleUnit.label}）` : '');
  bubbleSvg.select('.x-label')
    .attr('x', margin.left + width / 2)
    .attr('y', margin.top + height + 50)
    .text(xLabelText);

  bubbleSvg.select('.y-label')
    .attr('transform', `translate(18, ${margin.top + height / 2}) rotate(-90)`)
    .text(metricLabels[state.yMetric]);

  // Data join
  const bubbles = bubbleG.select('.bubbles').selectAll('.bubble')
    .data(data, d => d.iso);

  // Enter
  const enter = bubbles.enter()
    .append('circle')
    .attr('class', 'bubble')
    .attr('cx', d => bubbleXScale(d[state.xMetric]))
    .attr('cy', d => bubbleYScale(d[state.yMetric]))
    .attr('r', 0)
    .attr('fill', d => continentColors[d.continent])
    .attr('fill-opacity', 0.7)
    .attr('stroke', d => continentColors[d.continent])
    .on('mouseover', onBubbleMouseOver)
    .on('mousemove', onBubbleMouseMove)
    .on('mouseout', onBubbleMouseOut)
    .on('click', onBubbleClick);

  // Update + Enter
  bubbles.merge(enter)
    .transition()
    .duration(animate ? 500 : 0)
    .ease(d3.easeCubicOut)
    .attr('cx', d => bubbleXScale(d[state.xMetric]))
    .attr('cy', d => bubbleYScale(d[state.yMetric]))
    .attr('r', d => bubbleSizeScale(d[state.sizeMetric]))
    .attr('fill', d => continentColors[d.continent])
    .attr('stroke', d => continentColors[d.continent])
    .attr('fill-opacity', d => state.selectedCountries.size > 0 && !state.selectedCountries.has(d.iso) ? 0.15 : 0.7);

  // Exit
  bubbles.exit()
    .transition()
    .duration(300)
    .attr('r', 0)
    .remove();

  // Country labels for large bubbles
  updateBubbleLabels(data);
}

function updateBubbleLabels(data) {
  const labels = bubbleG.select('.bubbles').selectAll('.bubble-label')
    .data(data.filter(d => d.population > 100000000), d => d.iso);

  labels.enter()
    .append('text')
    .attr('class', 'bubble-label')
    .attr('text-anchor', 'middle')
    .attr('fill', 'white')
    .attr('font-size', '10px')
    .attr('font-weight', '600')
    .attr('pointer-events', 'none')
    .attr('dy', -2)
    .merge(labels)
    .transition()
    .duration(500)
    .attr('x', d => bubbleXScale(d[state.xMetric]))
    .attr('y', d => bubbleYScale(d[state.yMetric]) - bubbleSizeScale(d[state.sizeMetric]) - 4)
    .text(d => {
      const cn = countryNameCN[d.name] || d.name;
      return cn.length > 6 ? cn.substring(0, 5) + '…' : cn;
    });

  labels.exit().remove();
}

// ===== Zoom =====
function onZoom(event) {
  const { margin, width, height } = getBubbleChartDimensions();
  const transform = event.transform;

  // Rescale axes - handle log vs linear scales differently
  let newX, newY;
  if (state.xMetric === 'gdp' || state.xMetric === 'co2') {
    // For log scales, manually compute new domain from transform
    newX = bubbleXScale.copy().domain(
      [0, width].map(d => bubbleXScale.invert((d - transform.x) / transform.k))
    );
  } else {
    newX = transform.rescaleX(bubbleXScale);
  }
  newY = transform.rescaleY(bubbleYScale);

  let xAxisGen;
  if (state.xMetric === 'gdp') {
    xAxisGen = d3.axisBottom(newX).ticks(8, '$,.0f');
  } else if (state.xMetric === 'co2') {
    xAxisGen = d3.axisBottom(newX).ticks(8, ',.0f');
  } else if (state.xMetric === 'population' && currentXScaleUnit.power > 0) {
    const decimals = currentXScaleUnit.power >= 6 ? 1 : 0;
    const divisor = currentXScaleUnit.divisor;
    xAxisGen = d3.axisBottom(newX).ticks(8).tickFormat(d => (d / divisor).toFixed(decimals));
  } else {
    xAxisGen = d3.axisBottom(newX).ticks(8);
  }
  bubbleG.select('.axis-x').call(xAxisGen);
  bubbleG.select('.axis-y').call(d3.axisLeft(newY).ticks(8));
  bubbleG.select('.grid-x').call(d3.axisBottom(newX).ticks(8).tickSize(-height).tickFormat(''));
  bubbleG.select('.grid-y').call(d3.axisLeft(newY).ticks(8).tickSize(-width).tickFormat(''));

  // Transform bubbles
  bubbleG.selectAll('.bubble')
    .attr('cx', d => newX(d[state.xMetric]))
    .attr('cy', d => newY(d[state.yMetric]));

  bubbleG.selectAll('.bubble-label')
    .attr('x', d => newX(d[state.xMetric]))
    .attr('y', d => newY(d[state.yMetric]) - bubbleSizeScale(d[state.sizeMetric]) - 4);
}

function resetZoom() {
  bubbleSvg.transition().duration(500).call(bubbleZoom.transform, d3.zoomIdentity);
}

function zoomIn() {
  bubbleSvg.transition().duration(300).call(bubbleZoom.scaleBy, 1.5);
}

function zoomOut() {
  bubbleSvg.transition().duration(300).call(bubbleZoom.scaleBy, 0.67);
}

// ===== Selection =====
function clearSelection() {
  state.selectedCountries.clear();
  updateSelectionInfo();
  updateBubbleChart(false);
  updateBarChart();
}

function updateSelectionInfo() {
  const info = document.getElementById('selection-info');
  const text = document.getElementById('selection-text');
  if (state.selectedCountries.size > 0) {
    const names = state.countries
      .filter(c => state.selectedCountries.has(c.iso))
      .map(c => countryNameCN[c.name] || c.name);
    text.textContent = `已选：${names.join('、')}`;
    info.classList.add('visible');
  } else {
    info.classList.remove('visible');
  }
}

// ===== Tooltip =====
let tooltip;

function initTooltip() {
  tooltip = d3.select('body').append('div').attr('class', 'tooltip');
}

function onBubbleMouseOver(event, d) {
  const countryInfo = state.countries.find(c => c.iso === d.iso);
  tooltip.html(`
    <div class="tooltip-title" style="color:${continentColors[d.continent]}">${countryNameCN[countryInfo.name] || countryInfo.name}</div>
    <div class="tooltip-row"><span class="tooltip-label">大洲</span><span class="tooltip-value">${continentNames[d.continent] || d.continent}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">人均GDP</span><span class="tooltip-value">${metricFormats.gdp(d.gdp)}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">预期寿命</span><span class="tooltip-value">${metricFormats.lifeExp(d.lifeExp)}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">人口</span><span class="tooltip-value">${metricFormats.population(d.population)}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">CO₂</span><span class="tooltip-value">${metricFormats.co2(d.co2)}</span></div>
  `)
  .classed('visible', true);
}

function onBubbleMouseMove(event) {
  tooltip
    .style('left', (event.pageX + 15) + 'px')
    .style('top', (event.pageY - 15) + 'px');
}

function onBubbleMouseOut() {
  tooltip.classed('visible', false);
}

function onBubbleClick(event, d) {
  if (state.selectedCountries.has(d.iso)) {
    state.selectedCountries.delete(d.iso);
  } else {
    state.selectedCountries.add(d.iso);
  }
  updateSelectionInfo();
  updateBubbleChart(false);
  updateBarChart();
}

// ===== Legend =====
function drawLegend() {
  const legendData = Object.entries(continentColors);
  const legend = bubbleG.append('g').attr('class', 'legend')
    .attr('transform', 'translate(10, 10)');

  const items = legend.selectAll('.legend-item')
    .data(legendData)
    .enter()
    .append('g')
    .attr('class', 'legend-item')
    .attr('transform', (d, i) => `translate(0, ${i * 22})`)
    .on('click', (event, d) => toggleContinent(d[0]));

  items.append('circle')
    .attr('r', 6)
    .attr('fill', d => d[1])
    .attr('opacity', 0.8);

  items.append('text')
    .attr('x', 14)
    .attr('y', 4)
    .text(d => continentNames[d[0]])
    .attr('fill', '#8892a8')
    .attr('font-size', '12px');
}

// ===== Bar Chart =====
let barSvg, barG, barXScale, barYScale;

function initBarChart() {
  const { margin, width, height } = getBarChartDimensions();

  barSvg = d3.select('#bar-chart-container')
    .append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

  barG = barSvg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  barXScale = d3.scaleLinear().range([0, width]);
  barYScale = d3.scaleBand().range([0, height]).padding(0.2);

  barG.append('g').attr('class', 'axis axis-x').attr('transform', `translate(0,${height})`);
  barG.append('g').attr('class', 'axis axis-y');

  // Label
  barSvg.append('text').attr('class', 'bar-x-label')
    .attr('text-anchor', 'middle')
    .attr('fill', '#8892a8')
    .attr('font-size', '12px');
}

function updateBarChart(animate = true) {
  const { margin, width, height } = getBarChartDimensions();
  let data = getCurrentYearData();

  // If countries are selected, show those; otherwise show top 15
  if (state.selectedCountries.size > 0) {
    data = data.filter(d => state.selectedCountries.has(d.iso));
  }

  // Sort and take top 15
  data.sort((a, b) => (b[state.barMetric] || 0) - (a[state.barMetric] || 0));
  data = data.slice(0, 15);

  // Update header
  document.getElementById('bar-chart-info').textContent =
    `按${metricLabels[state.barMetric].split('（')[0]}排名前15`;

  // Update scales
  const maxVal = d3.max(data, d => d[state.barMetric]) || 1;
  barXScale.domain([0, maxVal * 1.1]);
  barYScale.domain(data.map(d => d.iso));

  // Determine bar x-axis formatting with scale units
  const barUnit = getScaleUnit(maxVal);
  let barXAxis;
  if (barUnit.power > 0 && (state.barMetric === 'population' || state.barMetric === 'gdp' || state.barMetric === 'co2')) {
    const decimals = barUnit.power >= 6 ? 1 : 0;
    barXAxis = d3.axisBottom(barXScale).ticks(6).tickFormat(d => (d / barUnit.divisor).toFixed(decimals));
  } else {
    barXAxis = d3.axisBottom(barXScale).ticks(6);
  }

  const yAxis = d3.axisLeft(barYScale).tickFormat(d => {
    const c = state.countries.find(c => c.iso === d);
    return c ? (countryNameCN[c.name] || c.name) : d;
  });

  barG.select('.axis-x').transition().duration(animate ? 400 : 0).call(barXAxis);
  barG.select('.axis-y').transition().duration(animate ? 400 : 0).call(yAxis);

  // X-axis label
  const barLabelText = metricLabels[state.barMetric] + (barUnit.power > 0 && (state.barMetric === 'population' || state.barMetric === 'gdp' || state.barMetric === 'co2') ? `（${barUnit.label}）` : '');
  barSvg.select('.bar-x-label')
    .attr('x', margin.left + width / 2)
    .attr('y', margin.top + height + 45)
    .text(barLabelText);

  // Data join
  const bars = barG.selectAll('.bar-rect').data(data, d => d.iso);

  // Enter
  const enter = bars.enter()
    .append('rect')
    .attr('class', 'bar-rect')
    .attr('x', 0)
    .attr('y', d => barYScale(d.iso))
    .attr('height', barYScale.bandwidth())
    .attr('width', 0)
    .attr('fill', d => continentColors[d.continent])
    .attr('rx', 3)
    .attr('opacity', 0.85)
    .on('mouseover', function(event, d) {
      d3.select(this).attr('opacity', 1);
      highlightBubble(d.iso, true);
    })
    .on('mouseout', function(event, d) {
      d3.select(this).attr('opacity', 0.85);
      highlightBubble(d.iso, false);
    })
    .on('click', (event, d) => {
      onBubbleClick(event, d);
    });

  // Update
  enter.merge(bars)
    .transition()
    .duration(animate ? 400 : 0)
    .attr('y', d => barYScale(d.iso))
    .attr('height', barYScale.bandwidth())
    .attr('width', d => barXScale(d[state.barMetric] || 0))
    .text(d => d.name);

  // Exit
  bars.exit()
    .transition()
    .duration(300)
    .attr('width', 0)
    .remove();

  // Value labels
  const valLabels = barG.selectAll('.bar-value').data(data, d => d.iso);

  valLabels.enter()
    .append('text')
    .attr('class', 'bar-value')
    .attr('fill', '#8892a8')
    .attr('font-size', '10px')
    .attr('dy', '0.35em')
    .merge(valLabels)
    .transition()
    .duration(animate ? 400 : 0)
    .attr('x', d => barXScale(d[state.barMetric] || 0) + 5)
    .attr('y', d => barYScale(d.iso) + barYScale.bandwidth() / 2)
    .text(d => {
      const val = d[state.barMetric];
      if (state.barMetric === 'population') return formatPopulation(val);
      if (state.barMetric === 'gdp') return `$${val?.toLocaleString()}`;
      if (state.barMetric === 'co2') return `${val?.toLocaleString()}`;
      return val?.toFixed(1);
    });

  valLabels.exit().remove();
}

function highlightBubble(iso, highlight) {
  const bubble = bubbleG.selectAll('.bubble').filter(d => d.iso === iso);
  if (highlight) {
    bubble.classed('highlighted', true);
  } else {
    bubble.classed('highlighted', false);
  }
}

// ===== Timeline =====
function initTimeline() {
  const slider = document.getElementById('year-slider');
  slider.min = 0;
  slider.max = state.years.length - 1;
  slider.value = state.currentYearIndex;
  updateYearDisplay();

  slider.addEventListener('input', (e) => {
    state.currentYearIndex = parseInt(e.target.value);
    updateYearDisplay();
    updateBubbleChart(true);
    updateBarChart();
    updateInfoBar();
  });

  // Markers
  drawTimelineMarkers();

  // Annotation markers on timeline
  drawAnnotationMarkers();
}

function drawTimelineMarkers() {
  const container = document.getElementById('timeline-markers');
  container.innerHTML = '';
  state.years.forEach(y => {
    const span = document.createElement('span');
    span.textContent = y;
    container.appendChild(span);
  });
}

function drawAnnotationMarkers() {
  const sliderContainer = document.querySelector('.timeline-slider-container');
  const slider = document.getElementById('year-slider');
  const sliderWidth = slider.offsetWidth;

  state.annotations.forEach(ann => {
    const yearIndex = state.years.indexOf(ann.year);
    if (yearIndex === -1) return;
    const pct = yearIndex / (state.years.length - 1);
    const marker = document.createElement('div');
    marker.className = 'annotation-marker';
    marker.style.left = `${pct * 100}%`;
    marker.setAttribute('data-tooltip', `${ann.year}: ${ann.text}`);
    marker.addEventListener('click', () => {
      state.currentYearIndex = yearIndex;
      slider.value = yearIndex;
      updateYearDisplay();
      updateBubbleChart(true);
      updateBarChart();
      updateInfoBar();
    });
    sliderContainer.appendChild(marker);
  });
}

function updateYearDisplay() {
  document.getElementById('year-display').textContent = state.years[state.currentYearIndex];
}

// Play/Pause
function togglePlay() {
  if (state.playing) {
    stopPlay();
  } else {
    startPlay();
  }
}

function startPlay() {
  state.playing = true;
  document.getElementById('play-btn').innerHTML = '⏸ 暂停';
  document.getElementById('play-btn').classList.add('active');

  state.playInterval = setInterval(() => {
    state.currentYearIndex++;
    if (state.currentYearIndex >= state.years.length) {
      state.currentYearIndex = 0;
    }
    document.getElementById('year-slider').value = state.currentYearIndex;
    updateYearDisplay();
    updateBubbleChart(true);
    updateBarChart();
    updateInfoBar();
  }, state.playSpeed);
}

function stopPlay() {
  state.playing = false;
  clearInterval(state.playInterval);
  document.getElementById('play-btn').innerHTML = '▶ 播放';
  document.getElementById('play-btn').classList.remove('active');
}

function changeSpeed(delta) {
  state.playSpeed = Math.max(200, Math.min(3000, state.playSpeed + delta));
  document.getElementById('speed-display').textContent = `${(state.playSpeed / 1000).toFixed(1)}s`;
  if (state.playing) {
    stopPlay();
    startPlay();
  }
}

// ===== Info Bar =====
function updateInfoBar() {
  const data = getCurrentYearData();
  const totalPop = d3.sum(data, d => d.population);
  const avgLifeExp = d3.mean(data, d => d.lifeExp);
  const avgGdp = d3.mean(data, d => d.gdp);
  const totalCo2 = d3.sum(data, d => d.co2);

  document.getElementById('stat-countries').textContent = data.length;
  document.getElementById('stat-population').textContent = formatPopulation(totalPop);
  document.getElementById('stat-lifeexp').textContent = avgLifeExp ? avgLifeExp.toFixed(1) : 'N/A';
  document.getElementById('stat-gdp').textContent = avgGdp ? `$${Math.round(avgGdp).toLocaleString()}` : 'N/A';
  document.getElementById('stat-co2').textContent = totalCo2 ? `${Math.round(totalCo2).toLocaleString()} MT` : 'N/A';
}

// ===== Continent Filters =====
function toggleContinent(continent) {
  if (state.activeContinents.has(continent)) {
    if (state.activeContinents.size === 1) return; // Keep at least one
    state.activeContinents.delete(continent);
  } else {
    state.activeContinents.add(continent);
  }
  updateContinentButtons();
  updateBubbleChart(true);
  updateBarChart();
  updateInfoBar();
}

function updateContinentButtons() {
  document.querySelectorAll('.continent-btn').forEach(btn => {
    const c = btn.getAttribute('data-continent');
    btn.classList.toggle('active', state.activeContinents.has(c));
  });
}

function selectAllContinents() {
  state.activeContinents = new Set(['Asia', 'Europe', 'Americas', 'Africa', 'Oceania']);
  updateContinentButtons();
  updateBubbleChart(true);
  updateBarChart();
  updateInfoBar();
}

// ===== Metric Switching =====
function setXMetric(metric) {
  state.xMetric = metric;
  document.getElementById('x-metric').value = metric;
  resetZoom();
  updateBubbleChart(true);
}

function setYMetric(metric) {
  state.yMetric = metric;
  document.getElementById('y-metric').value = metric;
  resetZoom();
  updateBubbleChart(true);
}

function setBarMetric(metric) {
  state.barMetric = metric;
  updateBarChart();
}

// ===== Tab Navigation =====
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target).classList.add('active');
    });
  });
}

// ===== Window Resize =====
function handleResize() {
  // Redraw charts on resize
  d3.select('#bubble-chart-container svg').remove();
  d3.select('#bar-chart-container svg').remove();
  initBubbleChart();
  initBarChart();
  updateBubbleChart(false);
  updateBarChart();
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(handleResize, 300);
});

// ===== Initialize Application =====
async function init() {
  const success = await loadData();
  if (!success) {
    document.querySelector('.app-container').innerHTML = '<div class="no-data"><h2>数据加载失败</h2><p>请确保数据文件存在。</p></div>';
    return;
  }

  // Initialize all components
  initTooltip();
  initBubbleChart();
  initBarChart();
  initTimeline();
  initTabs();

  // Initial render
  updateBubbleChart(false);
  updateBarChart();
  updateInfoBar();
  updateContinentButtons();

  // Event listeners
  document.getElementById('play-btn').addEventListener('click', togglePlay);
  document.getElementById('speed-down').addEventListener('click', () => changeSpeed(200));
  document.getElementById('speed-up').addEventListener('click', () => changeSpeed(-200));
  document.getElementById('zoom-in').addEventListener('click', zoomIn);
  document.getElementById('zoom-out').addEventListener('click', zoomOut);
  document.getElementById('zoom-reset').addEventListener('click', resetZoom);
  document.getElementById('clear-selection').addEventListener('click', clearSelection);
  document.getElementById('select-all-continents').addEventListener('click', selectAllContinents);

  document.getElementById('x-metric').addEventListener('change', (e) => setXMetric(e.target.value));
  document.getElementById('y-metric').addEventListener('change', (e) => setYMetric(e.target.value));
  document.getElementById('bar-metric').addEventListener('change', (e) => setBarMetric(e.target.value));

  // Continent filter buttons
  document.querySelectorAll('.continent-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleContinent(btn.getAttribute('data-continent')));
  });

  // Hide loading overlay
  document.getElementById('loading').classList.add('hidden');
  setTimeout(() => document.getElementById('loading').remove(), 500);
}

// Start application
document.addEventListener('DOMContentLoaded', init);