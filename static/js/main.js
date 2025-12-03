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

    editorPanel.classList.remove('hidden');
}

closeBtn.addEventListener('click', () => {
    editorPanel.classList.add('hidden');
    currentNoteId = null;
    // Camera back to overview?
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
        // Reload graph to update physics (size) and links
        loadGraph();

        // Also update local visual immediately for better feel?
        // But physics update requires graphData refresh usually.
    }
});

// Create Note
addNoteBtn.addEventListener('click', async () => {
    const title = newNoteTitleInput.value.trim();
    if (!title) return;

    const res = await fetch('/api/notes', {
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
    noteCloud.value = currentVal; // Restore selection if valid
}

function renderCloudList(clouds) {
    cloudList.innerHTML = '';
    clouds.forEach(c => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${c.name}</span>
            <button onclick="deleteCloud(${c.id})"><i class="fas fa-trash"></i></button>
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
        // Update local list
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
        // Refresh graph as notes might have lost cloud
        loadGraph();
    }
};

// Settings Toggle
settingsBtn.addEventListener('click', () => {
    settingsOverlay.classList.remove('hidden');
});
closeSettingsBtn.addEventListener('click', () => {
    settingsOverlay.classList.add('hidden');
});

// Drag to Connect Logic (3D Overlap)
function checkForOverlapConnection(sourceNode) {
    const threshold = 20; // 3D units distance

    // sourceNode has {x, y, z}
    for (const targetNode of graphData.nodes) {
        if (targetNode.id === sourceNode.id) continue;

        const dx = sourceNode.x - targetNode.x;
        const dy = sourceNode.y - targetNode.y;
        const dz = sourceNode.z - targetNode.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

        if (dist < threshold) {
            // Check if connection already exists?
            // API handles this, but we can check locally to save a call
            // Create Connection
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
                    // Force refresh to show link
                    loadGraph();
                }
            });
            break; // Only connect to one at a time
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
