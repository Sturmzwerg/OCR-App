from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
import re
import os
import sys

# Determine DB Path
# If running on Android (P4A), use internal storage
if 'ANDROID_ARGUMENT' in os.environ:
    from android.storage import app_storage_path
    db_folder = app_storage_path()
else:
    # Local dev or server
    db_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
    os.makedirs(db_folder, exist_ok=True)

db_path = os.path.join(db_folder, 'notes.db')

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
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
    z = db.Column(db.Float, default=0)
    color = db.Column(db.String(20), default="#44aaff")
    cloud_id = db.Column(db.Integer, db.ForeignKey('cloud.id'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'x': self.x,
            'y': self.y,
            'z': self.z,
            'color': self.color,
            'cloud_id': self.cloud_id,
            'size': len(self.content) if self.content else 0
        }

class Connection(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    source_id = db.Column(db.Integer, db.ForeignKey('note.id'), nullable=False)
    target_id = db.Column(db.Integer, db.ForeignKey('note.id'), nullable=False)
    type = db.Column(db.String(50), default="manual")

    def to_dict(self):
        return {
            'id': self.id,
            'source': self.source_id,
            'target': self.target_id,
            'type': self.type
        }

with app.app_context():
    db.create_all()
    if not Cloud.query.first():
        db.session.add(Cloud(name="Quick Notes"))
        db.session.add(Cloud(name="Journal"))
        db.session.add(Cloud(name="Learning"))
        db.session.commit()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/graph')
def get_graph():
    notes = Note.query.all()
    connections = Connection.query.all()
    clouds = Cloud.query.all()
    return jsonify({
        'nodes': [n.to_dict() for n in notes],
        'links': [c.to_dict() for c in connections],
        'clouds': [c.to_dict() for c in clouds]
    })

@app.route('/api/clouds', methods=['GET', 'POST'])
def manage_clouds():
    if request.method == 'POST':
        data = request.json
        name = data.get('name')
        if not name: return jsonify({'error': 'Name required'}), 400
        if Cloud.query.filter_by(name=name).first():
            return jsonify({'error': 'Cloud exists'}), 400

        new_cloud = Cloud(name=name)
        db.session.add(new_cloud)
        db.session.commit()
        return jsonify(new_cloud.to_dict())
    else:
        clouds = Cloud.query.all()
        return jsonify([c.to_dict() for c in clouds])

@app.route('/api/clouds/<int:cloud_id>', methods=['DELETE'])
def delete_cloud(cloud_id):
    cloud = Cloud.query.get(cloud_id)
    if cloud:
        Note.query.filter_by(cloud_id=cloud_id).update({'cloud_id': None})
        db.session.delete(cloud)
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'error': 'Not found'}), 404

@app.route('/api/notes', methods=['POST'])
def create_note():
    data = request.json
    title = data.get('title')
    if not title: return jsonify({'error': 'Title is required'}), 400

    if Note.query.filter_by(title=title).first():
        return jsonify({'error': 'Note already exists'}), 400

    new_note = Note(
        title=title,
        x=data.get('x', 0),
        y=data.get('y', 0),
        z=data.get('z', 0),
        color=data.get('color', '#44aaff'),
        cloud_id=data.get('cloud_id')
    )
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

    if 'x' in data: note.x = data['x']
    if 'y' in data: note.y = data['y']
    if 'z' in data: note.z = data['z']

    if 'color' in data: note.color = data['color']
    if 'cloud_id' in data: note.cloud_id = data['cloud_id']

    db.session.commit()
    return jsonify(note.to_dict())

@app.route('/api/connections', methods=['POST'])
def create_connection():
    data = request.json
    source_id = data.get('source')
    target_id = data.get('target')

    if isinstance(source_id, dict): source_id = source_id.get('id')
    if isinstance(target_id, dict): target_id = target_id.get('id')

    if not source_id or not target_id:
        return jsonify({'error': 'Source and Target IDs required'}), 400

    existing = Connection.query.filter_by(source_id=source_id, target_id=target_id).first()
    if existing:
         return jsonify(existing.to_dict())

    new_conn = Connection(source_id=source_id, target_id=target_id, type='manual')
    db.session.add(new_conn)
    db.session.commit()
    return jsonify(new_conn.to_dict())

def update_text_connections(note):
    Connection.query.filter_by(source_id=note.id, type='text').delete()
    links = re.findall(r'\[\[(.*?)\]\]', note.content)

    for link_title in links:
        target = Note.query.filter_by(title=link_title).first()
        if target:
            if target.id != note.id:
                new_conn = Connection(source_id=note.id, target_id=target.id, type='text')
                db.session.add(new_conn)
        else:
            target = Note(title=link_title)
            db.session.add(target)
            db.session.flush()
            new_conn = Connection(source_id=note.id, target_id=target.id, type='text')
            db.session.add(new_conn)

# Export for wrapper
def start_server():
    app.run(host='0.0.0.0', port=5000)

if __name__ == '__main__':
    start_server()
