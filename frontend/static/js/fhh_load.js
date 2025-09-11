let apiConfig = { baseUrl: "" };

/**
 * Builds API URL by combining base URL with endpoint
 * @param {string} endpoint - The API endpoint path
 * @returns {string} Complete URL or relative path if no base URL configured
 */
function buildApiUrl(endpoint) {
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
export function initializeApiConfig(config) {
  if (config?.api?.baseUrl) {
    apiConfig.baseUrl = config.api.baseUrl;
    console.log("API base URL configured:", apiConfig.baseUrl);
  } else {
    console.log("No API base URL configured, using relative paths");
  }
}

/**
 * Loads and displays the list of available family files
 */
export async function check_for_files() {
  await getFileList(buildApiUrl("/families"));
}

/**
 * Populates the file selection dropdown with family list
 * @param {string[]} file_list - Array of family IDs
 */
export function load_files_into_select(file_list) {
  const select = document.getElementById("file_select");

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
async function getFileList(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const filelist = JSON.parse(await response.text());
    const family_list = filelist
      .map((filename) => filename.split(".")[0])
      .sort();

    load_files_into_select(family_list);
    return family_list;
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

  const pedigree_file = buildApiUrl("/families/" + family_id);
  const annotations_file = buildApiUrl("/annotations/" + family_id);
  const config_file = `/config/${config_id || "basic"}`;

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
  const family_id = proband_id.split("-")[0];
  console.log(family_id);

  const people_positions = Object.fromEntries(
    Object.entries(data.people).map(([person_id, person]) => [
      person_id,
      { x: person.x, y: person.y },
    ])
  );

  save_file(family_id, { positions: people_positions });
}

/**
 * Saves annotation data to the server
 * @param {string} family_id - The family identifier
 * @param {Object} annotations - The annotation data to save
 * @returns {Promise<Object>} Server response data
 */
async function save_file(family_id, annotations) {
  const site_url = buildApiUrl("/annotations/" + family_id);

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
