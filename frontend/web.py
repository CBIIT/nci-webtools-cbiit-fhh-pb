from flask import Flask, request, send_from_directory, render_template, jsonify
import os
import json
import re
import requests
from datetime import datetime
from urllib.parse import urljoin

app = Flask(__name__)
app.config["JSONIFY_PRETTYPRINT_REGULAR"] = True  # Explicitly enable pretty-printing


CONFIG_FOLDER = os.path.join(app.root_path, "config")

def get_app_config():
    """Load application configuration from config/default.json"""
    try:
        config_path = os.path.join(CONFIG_FOLDER, "default.json")
        with open(config_path, "r") as f:
            return json.load(f)
    except Exception as e:
        app.logger.warning(f"Could not load app config: {e}")
        return {}

_app_config = get_app_config()
DATA_DIR = os.path.join(app.root_path, _app_config.get("dataDir", "../data"))
PROCESSED_FOLDER = os.path.join(DATA_DIR, "processed")
ANNOTATIONS_FOLDER = os.path.join(DATA_DIR, "annotations")

# Identifiers arriving from URLs and JSON payloads are used to build filesystem
# paths. Restrict them to a conservative allowlist and confirm that every
# resolved path stays inside its intended base directory.
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def is_safe_id(value):
    """Return True when value is safe to use as a single path segment."""
    return (
        isinstance(value, str)
        and value not in (".", "..")
        and _SAFE_ID.match(value) is not None
    )


def resolve_within(base, *parts):
    """Resolve parts under base, or return None if the result escapes base."""
    base_path = os.path.realpath(base)
    target = os.path.realpath(os.path.join(base_path, *parts))
    if not target.startswith(base_path + os.sep):
        return None
    return target


def invalid_id_response():
    """Uniform rejection for identifiers that cannot be used in a path."""
    return jsonify({"error": "invalid id value"}), 400

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
        if api_response.status_code == 404:
            return jsonify({"positions": {}}), 200
        return jsonify(api_response.json()), api_response.status_code

    # Fall back to local file serving
    if not is_safe_id(study_id) or not is_safe_id(family_id):
        return invalid_id_response()
    filename = family_id + ".annotations.json"
    study_annotations_dir = resolve_within(ANNOTATIONS_FOLDER, study_id)
    if study_annotations_dir is None:
        return invalid_id_response()
    annotation_path = resolve_within(study_annotations_dir, filename)
    if annotation_path is None or not os.path.exists(annotation_path):
        return jsonify({"positions": {}}), 200
    return send_from_directory(study_annotations_dir, filename)


@app.route("/config/<config_name>")
def get_config(config_name):
    if not is_safe_id(config_name):
        return invalid_id_response()
    filename = config_name + ".json"
    return send_from_directory(CONFIG_FOLDER, filename)

@app.route("/config/<config_name>.json")
def get_config_with_extension(config_name):
    """Route with explicit .json extension for consistency with static builds"""
    if not is_safe_id(config_name):
        return invalid_id_response()
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
    if not is_safe_id(study_id):
        return invalid_id_response()
    study_dir = resolve_within(PROCESSED_FOLDER, study_id)
    if study_dir is None:
        return invalid_id_response()
    return jsonify(os.listdir(study_dir))


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
        if not is_safe_id(value):
            return invalid_id_response()

    study_dir = resolve_within(PROCESSED_FOLDER, study_id)
    if study_dir is None:
        return invalid_id_response()
    os.makedirs(study_dir, exist_ok=True)

    filename_json = family_id + ".json"
    filepath_json = resolve_within(study_dir, filename_json)
    filename_processed = family_id + ".processed.json"
    filepath_processed = resolve_within(study_dir, filename_processed)
    if filepath_json is None or filepath_processed is None:
        return invalid_id_response()

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

    if not is_safe_id(study_id):
        return jsonify({"error": "invalid study_id"}), 400

    processed_study_dir = resolve_within(PROCESSED_FOLDER, study_id)
    annotations_study_dir = resolve_within(ANNOTATIONS_FOLDER, study_id)
    if processed_study_dir is None or annotations_study_dir is None:
        return jsonify({"error": "invalid study_id"}), 400
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
    if not is_safe_id(study_id) or not is_safe_id(family_id):
        return invalid_id_response()
    study_name = study_id
    processed_filename = family_id + ".processed.json"
    json_filename = family_id + ".json"
    study_folder = resolve_within(PROCESSED_FOLDER, study_name)
    if study_folder is None:
        return invalid_id_response()

    processed_path = resolve_within(study_folder, processed_filename)
    if processed_path is not None and os.path.exists(processed_path):
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
        if not is_safe_id(value):
            return invalid_id_response()

    study_dir = resolve_within(PROCESSED_FOLDER, study_id)
    if study_dir is None:
        return invalid_id_response()
    os.makedirs(study_dir, exist_ok=True)

    json_path = resolve_within(study_dir, family_id + ".json")
    processed_path = resolve_within(study_dir, family_id + ".processed.json")
    if json_path is None or processed_path is None:
        return invalid_id_response()
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
    if not is_safe_id(study_id) or not is_safe_id(family_id):
        return invalid_id_response()
    annotations_dir = resolve_within(ANNOTATIONS_FOLDER, study_id)
    if annotations_dir is None:
        return invalid_id_response()
    os.makedirs(annotations_dir, exist_ok=True)
    filename = resolve_within(annotations_dir, family_id + ".annotations.json")
    if filename is None:
        return invalid_id_response()

    datastr = data.decode("utf-8")
    app.logger.info(datastr)

    with open(filename, "w") as file_object:
        file_object.write(datastr)

    return '{"response": "OK"}'


if __name__ == "__main__":
    config_debug_mode = _app_config.get("debug_mode")
    if isinstance(config_debug_mode, bool):
        debug_mode = config_debug_mode
    else:
        debug_mode = os.getenv("FLASK_ENV", "development").lower() == "development"
    app.run(debug=debug_mode)
