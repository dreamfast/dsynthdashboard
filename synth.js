/*
 * Copyright (c) 2024, Nathan Sapwell <nathan@dreamfast.solutions>
 * Copyright (c) 2015-2017, John R. Marino <draco@marino.st>
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 */

// Config
const CONFIG = {
    API_BASE_URL: 'http://localhost', // Replace with actual API base URL
    PORT: 8899, // Port number for the API, if this value is empty it will default to the HTTPS.
    POLL_INTERVAL: 10000, // 10 seconds
};

// State
let state = {
    runActive: false,
    kFiles: 0,
    lastKFile: 1,
    history: [[]],
    currentStatus: 'all',
    buildInProgress: false
};

// Tab switching functionality
const switchTab = (tabName) => {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    document.getElementById(tabName).classList.remove('hidden');

    document.querySelectorAll('.tab-link').forEach(link => {
        link.classList.remove('border-blue-500', 'text-blue-600');
        link.classList.add('text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
    });
    document.querySelector(`.tab-link[data-tab="${tabName}"]`).classList.add('border-blue-500', 'text-blue-600');
    document.querySelector(`.tab-link[data-tab="${tabName}"]`).classList.remove('text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
};

// Update the existing updateProgressBar function with this new one
const updateProgressBar = (stats) => {
    const total = stats.queued + stats.built + stats.meta + stats.failed + stats.ignored + stats.skipped;

    const updateSection = (id, value) => {
        const element = document.getElementById(`progress-${id}`);
        const percentage = (value / total) * 100;
        element.style.width = `${percentage}%`;
    };

    updateSection('built', stats.built);
    updateSection('meta', stats.meta);
    updateSection('failed', stats.failed);
    updateSection('ignored', stats.ignored);
    updateSection('skipped', stats.skipped);
};

const createBadge = (key, value, color) => {
    return `<span id="stats_${key}" class="px-2 py-1 rounded-full bg-${color}-100 text-${color}-800 text-xs font-medium cursor-pointer filterable">${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}</span>`;
};

const updateStatsDisplay = (stats) => {
    const statsContainer = document.getElementById('stats');
    const additionalStatsContainer = document.getElementById('additional_stats');

    statsContainer.innerHTML = '';
    additionalStatsContainer.innerHTML = '';

    const mainStats = ['queued', 'built', 'meta', 'failed', 'ignored', 'skipped'];
    const colors = ['blue', 'green', 'yellow', 'red', 'orange', 'purple'];

    mainStats.forEach((key, index) => {
        statsContainer.innerHTML += createBadge(key, stats[key], colors[index]);
    });

    const additionalStats = ['remains', 'load', 'swapinfo', 'elapsed', 'pkghour', 'impulse'];
    additionalStats.forEach(key => {
        additionalStatsContainer.innerHTML += `<div><span class="font-bold">${key.charAt(0).toUpperCase() + key.slice(1)}:</span> <span id="stats_${key}">${stats[key]}</span></div>`;
    });
};

const updateBuildersTable = (builders) => {
    const tableBody = document.querySelector('#builders_body');
    const fragment = document.createDocumentFragment();

    builders.forEach(builder => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="p-2 b${builder.ID}" onclick="filter('[${builder.ID}]')" title="Click to filter for work done by builder ${builder.ID}">${builder.ID}</td>
            <td class="p-2">${builder.elapsed}</td>
            <td class="p-2">${builder.phase}</td>
            <td class="p-2">${builder.origin}</td>
            <td class="p-2">${builder.lines}</td>
        `;
        fragment.appendChild(row);
    });

    tableBody.innerHTML = '';
    tableBody.appendChild(fragment);
};

// API functions
const fetchWithRetry = async (url, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Attempt ${i + 1} failed: ${error}`);
            if (i === retries - 1) throw error;
        }
    }
};

const fetchSummary = () => fetchWithRetry(`${CONFIG.API_BASE_URL}:${CONFIG.PORT}/dports/logs/Report/summary.json`);

const fetchHistory = async (kFiles) => {
    const fetchPromises = [];
    for (let i = 1; i <= kFiles; i++) {
        const fileName = String(i).padStart(2, '0') + '_history.json';
        fetchPromises.push(fetchWithRetry(`${CONFIG.API_BASE_URL}:${CONFIG.PORT}/dports/logs/Report/${fileName}`));
    }
    return Promise.all(fetchPromises);
};

// Main functions
const processSummary = (data) => {
    state.kFiles = parseInt(data.kfiles);
    state.runActive = parseInt(data.active);

    document.getElementById('profile').textContent = data.profile;
    document.getElementById('kickoff').textContent = new Date(data.kickoff).toLocaleString();
    document.getElementById('polling').textContent = state.runActive ? "Active" : "Complete";

    if (data.stats) {
        updateStatsDisplay(data.stats);
        updateProgressBar(data.stats);
    }

    updateBuildersTable(data.builders);

    // Check if there's any active builder
    const activeBuilder = data.builders.find(builder => builder.phase !== "Idle");
    if (activeBuilder) {
        state.buildInProgress = true;
        switchTab('progress-builders');
    } else if (state.buildInProgress) {
        state.buildInProgress = false;
        switchTab('build-report');
    }
};

const processHistory = (historyData) => {
    const buildHistory = historyData.flat();
    const reportBody = document.getElementById('report_body');
    const fragment = document.createDocumentFragment();

    buildHistory.forEach(item => {
        const row = document.createElement('tr');
        row.className = getRowClass(item.result);
        row.innerHTML = `
            <td class="p-2">${formatEntry(item.entry, item.origin)}</td>
            <td class="p-2">${item.elapsed}</td>
            <td class="p-2">[${item.ID}]</td>
            <td class="p-2"><span class="inline-block px-2 py-1 text-xs font-bold text-white ${getResultClass(item.result)} rounded">${item.result}</span></td>
            <td class="text-left p-2">${portsMon(item.origin)}</td>
            <td class="text-left p-2">${information(item.result, item.origin, item.info)}</td>
            <td class="p-2">${skipInfo(item.result, item.info)}</td>
            <td class="p-2">${item.duration}</td>
        `;
        fragment.appendChild(row);
    });

    reportBody.innerHTML = '';
    reportBody.appendChild(fragment);
};

const handleSearch = (e) => {
    const searchValue = e.target.value.toLowerCase();
    filterRows(searchValue, state.currentStatus);
};

const handleStatusFilter = (status) => {
    state.currentStatus = status;
    const searchValue = document.getElementById('search').value.toLowerCase();
    filterRows(searchValue, status);
};

const filterRows = (searchValue, status) => {
    const rows = document.querySelectorAll('#report_body tr');

    rows.forEach(row => {
        const rowText = Array.from(row.cells)
            .filter((_, index) => index !== 3) // Exclude the status cell
            .reduce((text, cell) => text + ' ' + cell.textContent.toLowerCase(), '');

        const statusCell = row.cells[3];
        const statusText = statusCell.textContent.trim().toLowerCase();

        const matchesSearch = rowText.includes(searchValue);
        const matchesStatus = status === 'all' || statusText === status;

        row.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
    });
};

// Initialization
const initializeApp = async () => {
    try {
        const summaryData = await fetchSummary();
        processSummary(summaryData);

        const historyData = await fetchHistory(state.kFiles);
        processHistory(historyData);

        document.getElementById('build_info').style.display = 'block';
        document.getElementById('loading_stats_build').style.display = 'none';

        // Set up event listeners
        document.getElementById('search').addEventListener('input', handleSearch);
        document.querySelectorAll('.filterable').forEach(element => {
            element.addEventListener('click', () => {
                const status = element.textContent.split(':')[0].toLowerCase();
                handleStatusFilter(status === 'queued' ? 'all' : status);
            });
        });

        // Set up tab switching
        document.querySelectorAll('.tab-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                switchTab(e.target.getAttribute('data-tab'));
            });
        });

        // Add an "All" filter
        const allFilter = document.createElement('span');
        allFilter.textContent = 'All';
        allFilter.className = 'px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-medium cursor-pointer filterable';
        allFilter.addEventListener('click', () => handleStatusFilter('all'));
        document.querySelector('.flex.flex-wrap.justify-center.gap-2').appendChild(allFilter);

        // Initially show the Build Report tab
        switchTab('build-report');

        // Set up polling
        const pollData = async () => {
            const newSummary = await fetchSummary();
            processSummary(newSummary);

            if (state.buildInProgress) {
                setTimeout(pollData, CONFIG.POLL_INTERVAL);
            }
        };

        if (state.buildInProgress) {
            pollData();
        }

    } catch (error) {
        console.error('Initialization failed:', error);
        // Display error message to user
        const errorMessageElement = document.getElementById('error-message');
        if (errorMessageElement) {
            errorMessageElement.textContent = 'Failed to load data. Please try refreshing the page.';
            errorMessageElement.style.display = 'block';
        }
    }
};

document.addEventListener('DOMContentLoaded', initializeApp);

// Helper functions
function getRowClass(result) {
    const classes = {
        built: 'bg-green-100',
        failed: 'bg-red-100',
        skipped: 'bg-yellow-100',
        ignored: 'bg-blue-100',
        meta: 'bg-purple-100'
    };
    return classes[result] || 'bg-gray-100';
}

function getResultClass(result) {
    const classes = {
        built: 'bg-green-500',
        failed: 'bg-red-500',
        skipped: 'bg-yellow-500',
        ignored: 'bg-blue-500',
        meta: 'bg-purple-500'
    };
    return classes[result] || 'bg-gray-500';
}

function formatEntry(entry, origin) {
    return `<span class="entry cursor-pointer text-blue-600 hover:underline" onclick="filter('${origin}')">${entry}</span>`;
}

function portsMon(origin) {
    const [category, name] = origin.split('/');
    const [portName] = name.split('@');
    const freshportsLink = `<a class="text-blue-600 hover:underline" title="portsmon for ${origin}" href="https://www.freshports.org/${category}/${portName}">${origin}</a>`;
    return freshportsLink;
}

function information(result, origin, info) {
    switch (result) {
        case "meta":
            return 'meta-node complete.';
        case "built":
            return `<a class="text-blue-600 hover:underline" href="${logFile(origin)}">logfile</a>`;
        case "failed":
            const [phase] = info.split(':');
            return `Failed ${phase} phase (<a class="text-blue-600 hover:underline" href="${logFile(origin)}">logfile</a>)`;
        case "skipped":
            return `Issue with ${info}`;
        case "ignored":
            const [reason] = info.split(':|:');
            return reason;
        default:
            return "??";
    }
}

function skipInfo(result, info) {
    switch (result) {
        case "failed":
            const [, details] = info.split(':');
            return details;
        case "ignored":
            const [, skipReason] = info.split(':|:');
            return skipReason;
        default:
            return "";
    }
}

function logFile(origin) {
    const [category, name] = origin.split('/');
    return `../${category}___${name}.log`;
}

// Global function used in onclick attributes
function filter(txt) {
    const reportInput = document.querySelector('#report input');
    reportInput.value = txt;
    reportInput.dispatchEvent(new Event('input'));
}
