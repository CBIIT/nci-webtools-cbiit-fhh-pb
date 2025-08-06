from flask import Flask, request, send_from_directory, render_template, redirect, url_for, jsonify
import os
import json

app = Flask(__name__)
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = True # Explicitly enable pretty-printing


CONFIG_FOLDER = os.path.join(app.root_path, 'config')
PROCESSED_FOLDER = os.path.join(app.root_path, '../../processed')
ANNOTATIONS_FOLDER = os.path.join(app.root_path, 'annotations')

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/family/<family_id>')
def get_family(family_id):
    filename = family_id + ".processed.json"
    return send_from_directory(PROCESSED_FOLDER, filename)

@app.route('/annotations/<family_id>')
def get_annotations(family_id):
    filename = family_id + ".annotations.json"
    app.logger.info(ANNOTATIONS_FOLDER + "/" + filename)
    return send_from_directory(ANNOTATIONS_FOLDER, filename)

@app.route('/write_annotations/<family_id>', methods=["POST"])
def write_annotations(family_id):
    os.makedirs(ANNOTATIONS_FOLDER, exist_ok=True)

    filename = ANNOTATIONS_FOLDER + "/" + family_id + ".annotations.json"

    data = request.data
    datastr = data.decode('utf-8')
    app.logger.info(datastr)

    file_object = open(filename, "w")
    file_object.write(datastr)

    return '{"response": "OK"}'


@app.route('/config/<config_name>')
def get_config(config_name):
    filename = config_name + ".json"
    return send_from_directory(CONFIG_FOLDER, filename)

@app.route('/list_of_families')
def get_list_of_families():
    return os.listdir(PROCESSED_FOLDER)


if __name__ == '__main__':
    app.run(debug=True)
