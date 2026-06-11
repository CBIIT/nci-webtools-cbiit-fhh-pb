let apiConfig = { baseUrl: "" };
let loaded_study_id = null;
let loaded_family_id = null;
let configPromise = null;
let configData = null;

/**
 * Builds API URL by combining base URL with endpoint
 * @param {string} endpoint - The API endpoint path
 * @returns {string} Complete URL or relative path if no base URL configured
 */
function build_api_url(endpoint) {
  if (!apiConfig.baseUrl) return endpoint;

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  const baseUrl = apiConfig.baseUrl.endsWith("/")
    ? apiConfig.baseUrl
    : apiConfig.baseUrl + "/";
  return baseUrl + cleanEndpoint;
}

/**
 * Initializes API configuration from loaded config object
 * @param {Object} config - Configuration object containing API settings
 */
function initializeApiConfig(config) {
  if (config?.api?.baseUrl) {
    apiConfig.baseUrl = config.api.baseUrl;
    console.log("API base URL configured:", apiConfig.baseUrl);
  } else {
    console.log("No API base URL configured, using relative paths");
  }
}

export async function ensureConfigLoaded() {
  if (configData) {
    return configData;
  }
  
  if (!configPromise) {
    configPromise = loadConfigOnce();
  }
  
  return configPromise;
}

export async function create_study_directory(study_id) {
  const trimmed_study_id = (study_id || "").trim();
  if (!trimmed_study_id) {
    throw new Error("Study ID is required");
  }

  const response = await fetch(build_api_url("/studies"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ study_id: trimmed_study_id }),
  });

  if (!response.ok) {
    const error_text = await response.text();
    throw new Error(error_text || `Failed to create study (${response.status})`);
  }

  return await response.json();
}

export async function create_family_file(study_id, family_id, proband_id, proband_name) {
  const trimmed_study_id = (study_id || "").trim();
  const trimmed_family_id = (family_id || "").trim();
  const trimmed_proband_id = (proband_id || "").trim();
  const trimmed_proband_name = (proband_name || "").trim();

  if (!trimmed_study_id) throw new Error("Study ID is required");
  if (!trimmed_family_id) throw new Error("Family ID is required");
  if (!trimmed_proband_id) throw new Error("Proband ID is required");

  const response = await fetch(build_api_url(`/families/${trimmed_study_id}`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      family_id: trimmed_family_id,
      proband_id: trimmed_proband_id,
      proband_name: trimmed_proband_name,
    }),
  });

  if (!response.ok) {
    const error_text = await response.text();
    throw new Error(error_text || `Failed to create family (${response.status})`);
  }

  return await response.json();
}

async function loadConfigOnce() {
  try {
    const response = await fetch("/config/lfss.json");
    if (response.ok) {
      configData = await response.json();
      initializeApiConfig(configData);
      console.log("Initial config loaded:", configData);
      return configData;
    } else {
      console.log("Could not load config, using defaults");
      configData = { api: { baseUrl: "" } };
      return configData;
    }
  } catch (error) {
    console.log("Error loading config, using defaults:", error);
    configData = { api: { baseUrl: "" } };
    return configData;
  }
}

export function resetConfig() {
  configPromise = null;
  configData = null;
  apiConfig = { baseUrl: "" };
}

export async function check_for_studies() { 
  console.log("Checking for studies...");
  await ensureConfigLoaded();
  const studies = await get_study_list(build_api_url("/studies"));
  console.log(studies);
  return studies;
}

export async function check_for_families(study_id) {
  console.log("Checking for families...");
  await ensureConfigLoaded();
  const familes = await get_family_list(build_api_url("/families/" + study_id));
  console.log(familes);
}

/**
 * Populates the file selection dropdown with family list
 * @param {string[]} file_list - Array of family IDs
 */
export function load_families_into_select(file_list) {
  const select = document.getElementById("families_select");

  for (let i = select.options.length - 1; i >= 0; i--) {
    select.remove(i);
  }

  const blank_option = document.createElement("option");
  blank_option.text = ""; 
  select.add(blank_option);

  for (const i2 in file_list) {
    const option = document.createElement("option");
    option.value = file_list[i2];
    option.text = file_list[i2];
    select.add(option);
  }
}

/**
 * Populates the file selection dropdown with family list
 * @param {string[]} file_list - Array of family IDs
 */
export function load_studies_into_select(file_list) {
  const select = document.getElementById("study_select");

  for (let i = select.options.length - 1; i >= 0; i--) {
    select.remove(i);
  }

  const blank_option = document.createElement("option");
  blank_option.text = "";
  select.add(blank_option);

  for (const i2 in file_list) {
    const option = document.createElement("option");
    option.value = file_list[i2];
    option.text = file_list[i2];
    select.add(option);
  }
}

export function load_file() {
  alert("Boo");
}

/**
 * Fetches and processes the family file list from API
 * @param {string} url - API endpoint URL
 * @returns {Promise<string[]>} Array of family IDs
 */
async function get_family_list(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const filelist = JSON.parse(await response.text());
    const family_list = filelist
      .map((filename) => filename.split(".")[0])
      .sort();

    load_families_into_select(family_list);
    return family_list;
  } catch (error) {
    console.error("Error fetching file list:", error);
    return [];
  }
}

/**
 * Fetches and processes the family file list from API
 * @param {string} url - API endpoint URL
 * @returns {Promise<string[]>} Array of family IDs
 */
async function get_study_list(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const filelist = JSON.parse(await response.text());
    const study_list = filelist
      .map((filename) => filename.split(".")[0])
      .sort();

    if (study_list[0] === "")  study_list.shift(); // First item is an extra blank
    load_studies_into_select(study_list);
    return study_list;
  } catch (error) {
    console.error("Error fetching file list:", error);
    return [];
  }
}

/**
 * Loads family data, annotations, and configuration
 * @param {string} study_id - The study identifier (S3/filesystem folder name)
 * @param {string} family_id - The family identifier
 * @param {string} study_id - Study identifier
 * @param {string} config_id - Optional configuration ID (defaults to study_id, then lfss)
 * @returns {Promise<[Object, Object, Object]>} Array of [data, annotations, config]
 */
<<<<<<< Updated upstream
export async function load_config_and_data(study_id, family_id, config_id) {
  console.log("Study:" + study_id + " Family:" + family_id + " Config:" + config_id);
=======
export async function load_config_and_data(family_id, study_id, config_id) {
  console.log("Family:" + family_id + " study: " + study_id + " config: " + config_id);
>>>>>>> Stashed changes
  if (!family_id) {
    console.warn("No family ID provided");
    return;
  }
  const selected_study_id = (study_id || "lfss").trim();
  const selected_config_id = (config_id || selected_study_id || "lfss").trim();

<<<<<<< Updated upstream
  await ensureConfigLoaded();

  const pedigree_file = build_api_url("/family/" + study_id + "/" + family_id);
  const annotations_file = build_api_url("/annotations/" + study_id + "/" + family_id);
  const config_file = `/config/${config_id || "basic"}.json`;
=======
  const pedigree_file = build_api_url("/family/" + selected_study_id + "/" + family_id);
  const annotations_file = build_api_url("/annotations/" + selected_study_id + "/" + family_id);
  const config_file = `/config/${selected_config_id}.json`;
>>>>>>> Stashed changes

  loaded_study_id = study_id;
  loaded_family_id = family_id;
  loaded_study_id = selected_study_id;
  try {
    const [pedigree_response, annotations_response, primary_config_response] =
      await Promise.all([
        fetch(pedigree_file),
        fetch(annotations_file),
        fetch(config_file),
      ]);

    if (!pedigree_response.ok) {
      throw new Error(`Family request failed (${pedigree_response.status})`);
    }

    let config_response = primary_config_response;
    if (!config_response.ok && selected_config_id !== "lfss") {
      config_response = await fetch("/config/lfss.json");
    }
    if (!config_response.ok) {
      throw new Error(`Config request failed (${config_response.status})`);
    }

    const annotations = annotations_response.ok
      ? await annotations_response.json()
      : null;
    if (!annotations) {
      console.log(
        "No annotations file found. This is expected for families that haven't been annotated."
      );
    }

    const data = await pedigree_response.json();
    const config = await config_response.json();

    initializeApiConfig(config);

    return [data, annotations, config];
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  }
}

/**
 * Extracts and saves position data for all people in the family
 * @param {Object} data - Family pedigree data containing people and their positions
 */
export function save_positions_and_annotations(data) {
  const proband_id = data.general?.proband;
  const family_id = loaded_family_id;
<<<<<<< Updated upstream
  const study_id = loaded_study_id;
=======
  const study_id = loaded_study_id || "lfss";
>>>>>>> Stashed changes
  console.log("saving Annotations: " + study_id + "/" + family_id);

  const people_positions = Object.fromEntries(
    Object.entries(data.people).map(([person_id, person]) => [
      person_id,
      { x: person.x, y: person.y },
    ])
  );

  save_file(study_id, family_id, { positions: people_positions });
}

export async function save_family_json(data) {
  const family_id = loaded_family_id;
  const study_id = loaded_study_id || "lfss";

  if (!family_id) {
    throw new Error("No family is currently loaded");
  }

  const site_url = build_api_url("/family/" + study_id + "/" + family_id);
  const response = await fetch(site_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error_text = await response.text();
    throw new Error(error_text || `Failed to save family (${response.status})`);
  }

  return await response.json();
}

/**
 * Saves annotation data to the server
 * @param {string} family_id - The family identifier
 * @param {Object} annotations - The annotation data to save
 * @returns {Promise<Object>} Server response data
 */
async function save_file(study_id, family_id, annotations) {
  const site_url = build_api_url("/annotations/" + study_id + "/" +  family_id);

  try {
    const response = await fetch(site_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(annotations),
    });

    const responseData = await response.json();
    console.log("Success:", responseData);
    return responseData;
  } catch (error) {
    console.error("Error during fetch:", error);
    throw error;
  }
}
