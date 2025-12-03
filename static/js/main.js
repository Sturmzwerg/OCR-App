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
