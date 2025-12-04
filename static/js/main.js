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

// Initialize 3D Graph
function initGraph() {
    graph = ForceGraph3D()(container)
        .nodeLabel('title') // Tooltip
        .nodeColor(node => node.color || '#44aaff')
        .nodeVal(node => {
            // "Mass" / Size logic:
            // Base size + (content length factor)
            // Logarithmic scale often works better for visual balance
            const len = node.size || 0;
            return Math.max(1, Math.log(len + 1)) * 3 + 2;
        })
        .onNodeClick(node => {
            // Fly to node
            const distance = 40;
            const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);

            graph.cameraPosition(
                { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new position
                node, // lookAt ({ x, y, z })
                3000  // ms transition duration
            );

            openEditor(node);
        })
        .onNodeDragEnd(node => {
            // Save position
            if (node.fx !== undefined) {
                 // ForceGraph3D sets fx/fy/fz on drag.
                 // We want to persist this?
                 // Or just let physics take over after release?
                 // Prompt says "Gravity updated... not when writing...".
                 // "Nodes connected by user or if he pulls nodes onto each other".

                 // Check for overlap
                 checkForOverlapConnection(node);

                 // Release fixed position so physics can work again (moons orbit)
                 node.fx = null;
                 node.fy = null;
                 node.fz = null;

                 // Persist rough position if needed? Or just let simulation run?
                 // Usually saving x,y,z is good for initial load.
                 savePosition(node);
            }
        })
        .linkWidth(link => link.type === 'manual' ? 2 : 1)
        .linkColor(link => link.type === 'manual' ? '#ffffff' : '#555555')
        .backgroundColor('#000000'); // Starry background?

    // Custom Physics Config
    // We can access the d3 force simulation via graph.d3Force(name, [force])
    // Standard forces: 'link', 'charge', 'center'

    // 1. Text Weight / Gravity:
    // Already handled by nodeVal -> mass in standard force engine?
    // Actually, we want heavy nodes to attract connected nodes?
    // d3.forceManyBody().strength(...)
    // Default is repulsive (negative strength).
    // If we want "orbiting moons", we need the center to be attractive?
    // Or just strong links and the moons are lighter?
    // Let's rely on standard physics first: Heavy node = center of mass of that local cluster.

    // 2. Cloud Clustering
    // We add a custom force
    graph.d3Force('charge').strength(node => -100); // Repulsion to prevent overlap

    // Clustering Force
    // We pull nodes towards the centroid of their cloud
    // This requires calculating centroids each tick or simply pulling nodes of same cloud to each other.
    // Simpler approach: Create invisible "center" nodes for each cloud?
    // Or just a force that pulls nodes with same cloud_id together.

    // Let's implement a custom force for Cloud Clustering
    const clusterForce = (alpha) => {
        const strength = 0.2;
        const cloudCenters = {}; // id -> {x, y, z, count}

        // Calculate centers
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

        // Normalize
        Object.keys(cloudCenters).forEach(k => {
            const c = cloudCenters[k];
            c.x /= c.count;
            c.y /= c.count;
            c.z /= c.count;
        });

        // Apply force
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

    // Add custom force
    // Note: ForceGraph3D's d3-force-3d might need registering custom force differently?
    // actually graph.d3Force('cluster', clusterForce) works if passed a function that takes alpha.
    graph.d3Force('cluster', clusterForce);
}

// Data Loading
async function loadGraph() {
    const res = await fetch('/api/graph');
    graphData = await res.json();

    // Populate Clouds in UI (Editor)
    populateCloudSelect(graphData.clouds);
    renderCloudList(graphData.clouds);

    // Update Graph
    // 3d-force-graph expects { nodes, links }
    // We map our links to source/target ids
    // The library handles object reference replacement internally if ids match
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
});

saveBtn.addEventListener('click', async () => {
    if (!currentNoteId) return;

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

    const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title })
    });

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
