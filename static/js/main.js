// Global State
let graph = null;
let graphData = { nodes: [], links: [], clouds: [] };
let currentNoteId = null;

// DOM Elements
const container = document.getElementById('graph-3d');
const editorPanel = document.getElementById('editor-panel');
const noteTitle = document.getElementById('note-title');
const noteContent = document.getElementById('note-content');
const noteColor = document.getElementById('note-color');
const noteCloud = document.getElementById('note-cloud');
const saveBtn = document.getElementById('save-note');
const closeBtn = document.getElementById('close-editor');
const addNoteBtn = document.getElementById('add-note-btn');
const newNoteTitleInput = document.getElementById('new-note-title');
const settingsBtn = document.getElementById('settings-btn');
const settingsOverlay = document.getElementById('settings-overlay');
const closeSettingsBtn = document.getElementById('close-settings');
const cloudList = document.getElementById('cloud-list');
const newCloudNameInput = document.getElementById('new-cloud-name');
const addCloudBtn = document.getElementById('add-cloud-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const themeToggle = document.getElementById('theme-toggle');
const saveApiBtn = document.getElementById('save-api-btn');
const apiKeyInput = document.getElementById('api-key-input');

// Initialize 3D Graph
function initGraph() {
    graph = ForceGraph3D()(container)
        .nodeLabel('title') // Tooltip
        .nodeColor(node => node.color || '#44aaff')
        .nodeVal(node => {
            const len = node.size || 0;
            return Math.max(1, Math.log(len + 1)) * 3 + 2;
        })
        .onNodeClick(node => {
            const distance = 40;
            const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);

            graph.cameraPosition(
                { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
                node,
                3000
            );

            openEditor(node);
        })
        .onNodeDragEnd(node => {
            if (node.fx !== undefined) {
                 checkForOverlapConnection(node);
                 node.fx = null;
                 node.fy = null;
                 node.fz = null;
                 savePosition(node);
            }
        })
        .linkWidth(link => link.type === 'manual' ? 2 : 1)
        .linkColor(link => link.type === 'manual' ? '#ffffff' : '#555555')
        .backgroundColor('#000000');

    // Custom Force for Clouds
    const clusterForce = (alpha) => {
        const strength = 0.2;
        const cloudCenters = {};

        graphData.nodes.forEach(node => {
            if (node.cloud_id) {
                if (!cloudCenters[node.cloud_id]) cloudCenters[node.cloud_id] = {x:0, y:0, z:0, count:0};
                const c = cloudCenters[node.cloud_id];
                c.x += node.x;
                c.y += node.y;
                c.z += node.z;
                c.count++;
            }
        });

        Object.keys(cloudCenters).forEach(k => {
            const c = cloudCenters[k];
            c.x /= c.count;
            c.y /= c.count;
            c.z /= c.count;
        });

        graphData.nodes.forEach(node => {
            if (node.cloud_id) {
                const c = cloudCenters[node.cloud_id];
                if (c) {
                    node.vx += (c.x - node.x) * strength * alpha;
                    node.vy += (c.y - node.y) * strength * alpha;
                    node.vz += (c.z - node.z) * strength * alpha;
                }
            }
        });
    };

    graph.d3Force('charge').strength(node => -100);
    graph.d3Force('cluster', clusterForce);
}

// Data Loading
async function loadGraph() {
    const res = await fetch('/api/graph');
    graphData = await res.json();

    populateCloudSelect(graphData.clouds);
    renderCloudList(graphData.clouds);

    graph.graphData(graphData);
}

// Editor Logic
function openEditor(node) {
    currentNoteId = node.id;

    noteTitle.innerText = node.title;
    noteContent.value = node.content;
    noteColor.value = node.color || "#44aaff";
    noteCloud.value = node.cloud_id || "";
// Initialize Network
const container = document.getElementById('network');
const nodes = new vis.DataSet([]);
const edges = new vis.DataSet([]);
const data = { nodes, edges };
const options = {
    manipulation: {
        enabled: true,
        addNode: false, // We use our own button
        addEdge: function(data, callback) {
            if (data.from == data.to) {
                // Prevent self-loops if desired, or allow
                // callback(null);
                // return;
            }
            saveConnection(data.from, data.to, callback);
        },
        editEdge: false,
        deleteNode: false,
        deleteEdge: true // Allow deleting edges?
    },
    physics: {
        stabilization: false,
        barnesHut: {
            gravitationalConstant: -2000,
            springConstant: 0.04,
            springLength: 95
        }
    },
    nodes: {
        shape: 'box',
        margin: 10,
        font: {
            size: 16
        }
    }
};

const network = new vis.Network(container, data, options);

// Load Graph Data
async function loadGraph() {
    const response = await fetch('/api/graph');
    const graphData = await response.json();

    // Update DataSet instead of clearing to preserve state where possible
    nodes.update(graphData.nodes);
    edges.update(graphData.edges);
}

loadGraph();

// Interaction
network.on("doubleClick", function(params) {
    if (params.nodes.length > 0) {
        openEditor(params.nodes[0]);
    }
});

network.on("dragEnd", function(params) {
    // Save positions of dragged nodes
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const positions = network.getPositions([nodeId]);
        const pos = positions[nodeId];
        savePosition(nodeId, pos.x, pos.y);

        // Check for overlap to connect (Drag A onto B)
        checkForOverlapConnection(nodeId, pos);
    }
});

function checkForOverlapConnection(sourceNodeId, pos) {
    // Get all positions
    const allPositions = network.getPositions();
    const threshold = 50; // Distance threshold to consider as overlap

    for (const [targetId, targetPos] of Object.entries(allPositions)) {
        if (targetId == sourceNodeId) continue;

        const dx = pos.x - targetPos.x;
        const dy = pos.y - targetPos.y;
        const distance = Math.sqrt(dx*dx + dy*dy);

        if (distance < threshold) {
            // Found an overlap! Connect them.
            // Move source node slightly away so they don't remain stacked
            const newX = pos.x + 60;
            const newY = pos.y + 60;

            nodes.update({id: sourceNodeId, x: newX, y: newY});
            savePosition(sourceNodeId, newX, newY);

            saveConnection(sourceNodeId, targetId, (newConn) => {
                 if (newConn) edges.add(newConn);
            });
            break; // Connect to one node only
        }
    }
}


// Editor Logic
const editorPanel = document.getElementById('editor-panel');
const noteTitle = document.getElementById('note-title');
const noteContent = document.getElementById('note-content');
const saveBtn = document.getElementById('save-note');
const closeBtn = document.getElementById('close-editor');
let currentNoteId = null;

function openEditor(noteId) {
    currentNoteId = noteId;
    const node = nodes.get(noteId);

    noteTitle.innerText = node.label;
    noteContent.value = node.content || ""; // Assuming content is in node data (it is from our API)

    editorPanel.classList.remove('hidden');
}

closeBtn.addEventListener('click', () => {
    editorPanel.classList.add('hidden');
    currentNoteId = null;
    graph.cameraPosition({ x: 0, y: 0, z: 400 }, { x: 0, y: 0, z: 0 }, 2000);
});

saveBtn.addEventListener('click', async () => {
    if (!currentNoteId) return;

    const updateData = {
        content: noteContent.value,
        color: noteColor.value,
        cloud_id: noteCloud.value ? parseInt(noteCloud.value) : null
    };

    const res = await fetch(`/api/notes/${currentNoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
    });

    if (res.ok) {
        loadGraph();
    }
});

    const content = noteContent.value;

    const response = await fetch(`/api/notes/${currentNoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content })
    });

    if (response.ok) {
        // Reload graph because links might have changed
        loadGraph();
        // Might want to keep editor open and update local node data
        const updatedNote = await response.json();
        nodes.update(updatedNote); // Update local cache
    }
});

// Create Note
const addNoteBtn = document.getElementById('add-note-btn');
const newNoteTitleInput = document.getElementById('new-note-title');

addNoteBtn.addEventListener('click', async () => {
    const title = newNoteTitleInput.value.trim();
    if (!title) return;

    const res = await fetch('/api/notes', {
    const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title })
    });

    if (res.ok) {
        newNoteTitleInput.value = '';
        loadGraph();
    } else {
        alert('Error creating note');
    }
});

// Clouds Management
function populateCloudSelect(clouds) {
    const currentVal = noteCloud.value;
    noteCloud.innerHTML = '<option value="">None</option>';
    clouds.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.text = c.name;
        noteCloud.appendChild(opt);
    });
    noteCloud.value = currentVal;
}

function renderCloudList(clouds) {
    cloudList.innerHTML = '';
    clouds.forEach(c => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${c.name}</span>
            <button onclick="deleteCloud(${c.id})" title="Delete Cloud"><i class="fas fa-trash"></i></button>
        `;
        cloudList.appendChild(li);
    });
}

addCloudBtn.addEventListener('click', async () => {
    const name = newCloudNameInput.value.trim();
    if (!name) return;

    const res = await fetch('/api/clouds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
    });

    if (res.ok) {
        newCloudNameInput.value = '';
        const newCloud = await res.json();
        graphData.clouds.push(newCloud);
        populateCloudSelect(graphData.clouds);
        renderCloudList(graphData.clouds);
    }
});

window.deleteCloud = async (id) => {
    if (!confirm('Delete this cloud?')) return;
    const res = await fetch(`/api/clouds/${id}`, { method: 'DELETE' });
    if (res.ok) {
        graphData.clouds = graphData.clouds.filter(c => c.id !== id);
        populateCloudSelect(graphData.clouds);
        renderCloudList(graphData.clouds);
        loadGraph();
    }
};

// Settings Modal & Tabs
settingsBtn.addEventListener('click', () => {
    settingsOverlay.classList.remove('hidden');
});
closeSettingsBtn.addEventListener('click', () => {
    settingsOverlay.classList.add('hidden');
});

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active from all
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Add active to clicked
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});

// Theme Logic
function applyTheme(isLight) {
    if (isLight) {
        document.body.classList.add('light-mode');
        graph.backgroundColor('#f0f0f0');
        // We might want to change link colors for visibility
        graph.linkColor(link => link.type === 'manual' ? '#999' : '#ccc');
    } else {
        document.body.classList.remove('light-mode');
        graph.backgroundColor('#000000');
        graph.linkColor(link => link.type === 'manual' ? '#ffffff' : '#555555');
    }
}

themeToggle.addEventListener('change', (e) => {
    const isLight = e.target.checked; // Toggle logic might be inverted depending on label?
    // Let's assume checkbox Checked = Dark Mode (default), Unchecked = Light Mode
    // Wait, checkbox default is checked. Label says "Dark Mode".
    // So Checked = Dark, Unchecked = Light.

    // Invert logic for applyTheme which takes "isLight"
    applyTheme(!e.target.checked);
    localStorage.setItem('theme', e.target.checked ? 'dark' : 'light');
});

// Init Theme
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') {
    themeToggle.checked = false;
    applyTheme(true);
} else {
    themeToggle.checked = true;
    applyTheme(false);
}

// API Key Logic
saveApiBtn.addEventListener('click', () => {
    const key = apiKeyInput.value;
    localStorage.setItem('api_key', key);
    alert('API Key saved locally.');
});

if (localStorage.getItem('api_key')) {
    apiKeyInput.value = localStorage.getItem('api_key');
}


// Drag to Connect Logic (3D Overlap)
function checkForOverlapConnection(sourceNode) {
    const threshold = 20;

    for (const targetNode of graphData.nodes) {
        if (targetNode.id === sourceNode.id) continue;

        const dx = sourceNode.x - targetNode.x;
        const dy = sourceNode.y - targetNode.y;
        const dz = sourceNode.z - targetNode.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

        if (dist < threshold) {
            fetch('/api/connections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: sourceNode.id, target: targetNode.id })
            }).then(res => {
                if (res.ok) {
                    return res.json();
                }
            }).then(newConn => {
                if (newConn) {
                    loadGraph();
                }
            });
            break;
        }
    }
}

async function savePosition(node) {
    await fetch(`/api/notes/${node.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: node.x, y: node.y, z: node.z })
    });
}

// Init
initGraph();
loadGraph();
    if (response.ok) {
        const newNote = await response.json();
        nodes.add(newNote);
        newNoteTitleInput.value = '';
    } else {
        alert('Error creating note (maybe duplicate title?)');
    }
});

async function saveConnection(from, to, callback) {
    const response = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from, to: to })
    });

    if (response.ok) {
        const newConn = await response.json();
        // The callback adds the edge to Vis.js
        if (callback) callback(newConn);
        else edges.add(newConn);
    } else {
        if (callback) callback(null);
    }
}

async function savePosition(id, x, y) {
    await fetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: x, y: y })
    });
}
