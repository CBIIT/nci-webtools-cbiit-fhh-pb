from flask import Flask, request, send_from_directory, render_template, jsonify
import os
import json
import requests
from urllib.parse import urljoin

app = Flask(__name__)
app.config["JSONIFY_PRETTYPRINT_REGULAR"] = True  # Explicitly enable pretty-printing


CONFIG_FOLDER = os.path.join(app.root_path, "config")
PROCESSED_FOLDER = os.path.join(app.root_path, "../data/processed")
ANNOTATIONS_FOLDER = os.path.join(app.root_path, "../data/annotations")

print(PROCESSED_FOLDER)

# Load API configuration
def get_api_config():
    """Load API configuration from config/lfss.json"""
    try:
        config_path = os.path.join(CONFIG_FOLDER, "lfss.json")
        with open(config_path, "r") as f:
            config = json.load(f)
            return config.get("api", {}).get("baseUrl", "")
    except Exception as e:
        app.logger.warning(f"Could not load API config: {e}")
        return ""


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

@app.route("/studies")
def list_studies():
    # Try API Gateway first if configured
    api_response = proxy_to_api_gateway("studies", "GET")
    if api_response is not None:
        return jsonify(api_response.json()), api_response.status_code

    # Fall back to local directory listing
    return jsonify(os.listdir(os.path.join(PROCESSED_FOLDER)))


@app.route("/family/<study_id>/<family_id>")
def get_family_api_gateway(study_id, family_id):
    # Try API Gateway first if configured
    api_response = proxy_to_api_gateway(f"family/{study_id}/{family_id}", "GET")
    if api_response is not None:
        return jsonify(api_response.json()), api_response.status_code

    # Fall back to local file serving
    study_name = study_id;
    filename = family_id + ".processed.json"
    print ("Reading local file: " + PROCESSED_FOLDER + "/" + study_name + "/" + filename)
    return send_from_directory(os.path.join(PROCESSED_FOLDER, study_name), filename)


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
