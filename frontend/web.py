from flask import Flask, request, send_from_directory, render_template, jsonify
import os
import json
import requests
from datetime import datetime
from urllib.parse import urljoin

app = Flask(__name__)
app.config["JSONIFY_PRETTYPRINT_REGULAR"] = True  # Explicitly enable pretty-printing


CONFIG_FOLDER = os.path.join(app.root_path, "config")

def get_app_config():
    """Load application configuration from config/lfss.json"""
    try:
        config_path = os.path.join(CONFIG_FOLDER, "lfss.json")
        with open(config_path, "r") as f:
            return json.load(f)
    except Exception as e:
        app.logger.warning(f"Could not load app config: {e}")
        return {}

_app_config = get_app_config()
DATA_DIR = os.path.join(app.root_path, _app_config.get("dataDir", "../data"))
PROCESSED_FOLDER = os.path.join(DATA_DIR, "processed")
ANNOTATIONS_FOLDER = os.path.join(DATA_DIR, "annotations")

def get_api_config():
    """Return the API base URL from app config."""
    return _app_config.get("api", {}).get("baseUrl", "")


def proxy_to_api_gateway(endpoint, method="GET", data=None):
    """Proxy request to API Gateway if configured, otherwise handle locally"""
    api_base_url = get_api_config()

    if not api_base_url:
        return None  # Use local handling

    try:
        url = urljoin(api_base_url.rstrip("/") + "/", endpoint.lstrip("/"))

        if method == "GET":
            response = requests.get(url)
        elif method == "POST":
            response = requests.post(url, data=data, headers={"Content-Type": "application/json"})
        else:
            return None

        return response
    except Exception as e:
        app.logger.error(f"Error proxying to API Gateway: {e}")
        return None


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/family/<study_id>/<family_id>")
def get_family_legacy(study_id, family_id):
    return get_family_api_gateway(study_id,family_id)


@app.route("/annotations/<study_id>/<family_id>", methods=["GET"])
def get_annotations(study_id, family_id):
    # Try API Gateway first if configured
    api_response = proxy_to_api_gateway(f"annotations/{study_id}/{family_id}", "GET")
    if api_response is not None:
        return jsonify(api_response.json()), api_response.status_code

    # Fall back to local file serving
    filename = family_id + ".annotations.json"
    app.logger.info(ANNOTATIONS_FOLDER + "/" + filename)
    return send_from_directory(os.path.join(ANNOTATIONS_FOLDER, study_id), filename)


@app.route("/config/<config_name>")
def get_config(config_name):
    filename = config_name + ".json"
    return send_from_directory(CONFIG_FOLDER, filename)

@app.route("/config/<config_name>.json")
def get_config_with_extension(config_name):
    """Route with explicit .json extension for consistency with static builds"""
    filename = config_name + ".json"
    return send_from_directory(CONFIG_FOLDER, filename)


# API Gateway compatible routes
@app.route("/families/<study_id>")
def list_families(study_id):
    # Try API Gateway first if configured
    api_response = proxy_to_api_gateway(f"families/{study_id}", "GET")
    if api_response is not None:
        return jsonify(api_response.json()), api_response.status_code

    # Fall back to local directory listing
    return jsonify(os.listdir(os.path.join(PROCESSED_FOLDER, study_id)))


@app.route("/families/<study_id>", methods=["POST"])
def create_family(study_id):
    payload = request.get_json(silent=True) or {}
    family_id = (payload.get("family_id") or "").strip()
    proband_id = (payload.get("proband_id") or "").strip()
    proband_name = (payload.get("proband_name") or "").strip()

    if not study_id:
        return jsonify({"error": "study_id is required"}), 400
    if not family_id:
        return jsonify({"error": "family_id is required"}), 400
    if not proband_id:
        return jsonify({"error": "proband_id is required"}), 400

    for value in (study_id, family_id, proband_id):
        if "/" in value or "\\" in value or ".." in value:
            return jsonify({"error": "invalid id value"}), 400

    study_dir = os.path.join(PROCESSED_FOLDER, study_id)
    os.makedirs(study_dir, exist_ok=True)

    filename_json = family_id + ".json"
    filepath_json = os.path.join(study_dir, filename_json)
    filename_processed = family_id + ".processed.json"
    filepath_processed = os.path.join(study_dir, filename_processed)

    if os.path.exists(filepath_json) or os.path.exists(filepath_processed):
        return jsonify({"error": "family file already exists"}), 409

    family_data = {
        "general": {
            "study": study_id,
            "proband": proband_id,
            "family_classification": "",
            "family_genetic_status": "",
            "last_updated": datetime.utcnow().isoformat(),
        },
        "people": {
            proband_id: {
                "name": proband_name,
                "born": None,
                "deceased": False,
                "deathdate": None,
                "father": None,
                "mother": None,
                "demographics": {
                    "gender": "Unknown"
                },
                "diseases": [],
                "procedures": []
            }
        }
    }

    with open(filepath_json, "w") as output_file:
        json.dump(family_data, output_file, indent=2)

    return jsonify({"response": "OK", "study_id": study_id, "family_id": family_id, "file": filename_json})

@app.route("/studies")
def list_studies():
    # Try API Gateway first if configured
    api_response = proxy_to_api_gateway("studies", "GET")
    if api_response is not None:
        return jsonify(api_response.json()), api_response.status_code

    # Fall back to local directory listing
    return jsonify(os.listdir(os.path.join(PROCESSED_FOLDER)))


@app.route("/studies", methods=["POST"])
def create_study():
    payload = request.get_json(silent=True) or {}
    study_id = (payload.get("study_id") or "").strip()

    if not study_id:
        return jsonify({"error": "study_id is required"}), 400

    if "/" in study_id or "\\" in study_id or ".." in study_id:
        return jsonify({"error": "invalid study_id"}), 400

    processed_study_dir = os.path.join(PROCESSED_FOLDER, study_id)
    annotations_study_dir = os.path.join(ANNOTATIONS_FOLDER, study_id)
    os.makedirs(processed_study_dir, exist_ok=True)
    os.makedirs(annotations_study_dir, exist_ok=True)

    return jsonify({"response": "OK", "study_id": study_id})


@app.route("/family/<study_id>/<family_id>")
def get_family_api_gateway(study_id, family_id):
    # Try API Gateway first if configured
    api_response = proxy_to_api_gateway(f"family/{study_id}/{family_id}", "GET")
    if api_response is not None:
        return jsonify(api_response.json()), api_response.status_code

    # Fall back to local file serving
    study_name = study_id;
    processed_filename = family_id + ".processed.json"
    json_filename = family_id + ".json"
    study_folder = os.path.join(PROCESSED_FOLDER, study_name)

    if os.path.exists(os.path.join(study_folder, processed_filename)):
        filename = processed_filename
    else:
        filename = json_filename

    print ("Reading local file: " + PROCESSED_FOLDER + "/" + study_name + "/" + filename)
    return send_from_directory(study_folder, filename)


@app.route("/family/<study_id>/<family_id>", methods=["POST"])
def save_family_json(study_id, family_id):
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "invalid JSON payload"}), 400

    for value in (study_id, family_id):
        if "/" in value or "\\" in value or ".." in value:
            return jsonify({"error": "invalid id value"}), 400

    study_dir = os.path.join(PROCESSED_FOLDER, study_id)
    os.makedirs(study_dir, exist_ok=True)

    json_path = os.path.join(study_dir, family_id + ".json")
    processed_path = os.path.join(study_dir, family_id + ".processed.json")
    target_path = json_path if os.path.exists(json_path) or not os.path.exists(processed_path) else processed_path

    with open(target_path, "w") as output_file:
        json.dump(payload, output_file, indent=2)

    return jsonify({"response": "OK", "study_id": study_id, "family_id": family_id})


@app.route("/annotations/<study_id>/<family_id>", methods=["POST"])
def write_annotations_api_gateway(study_id,family_id):
    # Try API Gateway first if configured
    data = request.data
    api_response = proxy_to_api_gateway(f"annotations/{study_id}/{family_id}", "POST", data)
    if api_response is not None:
        return jsonify(api_response.json()), api_response.status_code

    # Fall back to local file writing
    os.makedirs(os.path.join(ANNOTATIONS_FOLDER, study_id), exist_ok=True)
    filename = os.path.join(ANNOTATIONS_FOLDER, study_id, family_id + ".annotations.json")

    datastr = data.decode("utf-8")
    app.logger.info(datastr)

    with open(filename, "w") as file_object:
        file_object.write(datastr)

    return '{"response": "OK"}'


if __name__ == "__main__":
    app.run(ssl_context='adhoc', debug=True)
