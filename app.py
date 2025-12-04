from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
import re

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///notes.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

class Cloud(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name
        }

class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False, unique=True)
    content = db.Column(db.Text, default="")
    x = db.Column(db.Float, default=0)
    y = db.Column(db.Float, default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'label': self.title, # Vis.js uses 'label'
            'content': self.content,
            'x': self.x,
            'y': self.y
        }

class Connection(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    source_id = db.Column(db.Integer, db.ForeignKey('note.id'), nullable=False)
    target_id = db.Column(db.Integer, db.ForeignKey('note.id'), nullable=False)
    type = db.Column(db.String(50), default="manual") # 'manual' or 'text'

    def to_dict(self):
        return {
            'id': self.id,
            'from': self.source_id, # Vis.js uses 'from'
            'to': self.target_id,   # Vis.js uses 'to'
            'type': self.type
        }

with app.app_context():
    db.create_all()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/graph')
def get_graph():
    notes = Note.query.all()
    connections = Connection.query.all()
    return jsonify({
        'nodes': [n.to_dict() for n in notes],
        'edges': [c.to_dict() for c in connections]
    })

@app.route('/api/notes', methods=['POST'])
def create_note():
    data = request.json
    title = data.get('title')
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    # Check if exists
    if Note.query.filter_by(title=title).first():
        return jsonify({'error': 'Note already exists'}), 400

    new_note = Note(title=title, x=data.get('x', 0), y=data.get('y', 0))
    db.session.add(new_note)
    db.session.commit()
    return jsonify(new_note.to_dict())

@app.route('/api/notes/<int:note_id>', methods=['PUT'])
def update_note(note_id):
    note = Note.query.get_or_404(note_id)
    data = request.json

    if 'content' in data:
        note.content = data['content']
        update_text_connections(note)

    if 'x' in data:
        note.x = data['x']
    if 'y' in data:
        note.y = data['y']

    db.session.commit()
    return jsonify(note.to_dict())

@app.route('/api/connections', methods=['POST'])
def create_connection():
    data = request.json
    source_id = data.get('from')
    target_id = data.get('to')

    if not source_id or not target_id:
        return jsonify({'error': 'Source and Target IDs required'}), 400

    # Check if connection exists
    existing = Connection.query.filter_by(source_id=source_id, target_id=target_id).first()
    if existing:
         return jsonify(existing.to_dict())

    new_conn = Connection(source_id=source_id, target_id=target_id, type='manual')
    db.session.add(new_conn)
    db.session.commit()
    return jsonify(new_conn.to_dict())

@app.route('/api/connections', methods=['DELETE'])
def delete_connection():
    # Only allow deleting manual connections? Or via ID?
    # For now let's say we pass the ID or from/to
    data = request.json
    conn_id = data.get('id')
    if conn_id:
        conn = Connection.query.get(conn_id)
        if conn:
            db.session.delete(conn)
            db.session.commit()
        return jsonify({'success': True})
    return jsonify({'error': 'ID required'}), 400

def update_text_connections(note):
    # 1. Remove existing 'text' connections from this note
    Connection.query.filter_by(source_id=note.id, type='text').delete()

    # 2. Parse content for [[Title]]
    # Regex for [[Title]]
    links = re.findall(r'\[\[(.*?)\]\]', note.content)

    for link_title in links:
        target = Note.query.filter_by(title=link_title).first()
        if target:
            # Create connection
            # Check if self-referencing? Vis.js handles it, but maybe not useful.
            if target.id != note.id:
                new_conn = Connection(source_id=note.id, target_id=target.id, type='text')
                db.session.add(new_conn)
        else:
            # Option: Create the note if it doesn't exist?
            # User might want this. Let's create a stub note.
            target = Note(title=link_title)
            db.session.add(target)
            db.session.flush() # get ID
            new_conn = Connection(source_id=note.id, target_id=target.id, type='text')
            db.session.add(new_conn)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
