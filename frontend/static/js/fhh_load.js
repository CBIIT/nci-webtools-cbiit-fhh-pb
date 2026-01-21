let apiConfig = { baseUrl: "" };
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
 * @param {string} family_id - The family identifier
 * @param {string} config_id - Optional configuration ID (defaults to 'basic')
 * @returns {Promise<[Object, Object, Object]>} Array of [data, annotations, config]
 */
export async function load_config_and_data(family_id, config_id) {
  console.log("Family:" + family_id + " and config: " + config_id);
  if (!family_id) {
    console.warn("No family ID provided");
    return;
  }
  if (!config_id) {
    console.log("No config ID provided, defaulting to 'basic'");
  }

  await ensureConfigLoaded();

  const pedigree_file = build_api_url("/family/" + "lfss" + "/" + family_id);
  const annotations_file = build_api_url("/annotations/" + "lfss" + "/" + family_id);
  const config_file = `/config/${config_id || "basic"}.json`;

  loaded_family_id = family_id;
  try {
    const [pedigree_response, annotations_response, config_response] =
      await Promise.all([
        fetch(pedigree_file),
        fetch(annotations_file),
        fetch(config_file),
      ]);

    if (!pedigree_response.ok || !config_response.ok) {
      throw new Error("One or more requests failed");
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
  }
}

/**
 * Extracts and saves position data for all people in the family
 * @param {Object} data - Family pedigree data containing people and their positions
 */
export function save_positions_and_annotations(data) {
  const proband_id = data.general?.proband;
  const family_id = loaded_family_id;
  const study_id = "lfss";
  console.log("saving Annotations: " + study_id + "/" + family_id);

  const people_positions = Object.fromEntries(
    Object.entries(data.people).map(([person_id, person]) => [
      person_id,
      { x: person.x, y: person.y },
    ])
  );

  save_file(study_id, family_id, { positions: people_positions });
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
