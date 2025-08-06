
export async function check_for_files() {
  await getFileList("/list_of_families");
}

export function load_files_into_select(file_list) {
  const select = document.getElementById("file_select");

  // Empty the current choices
  for(let i = select.options.length - 1; i >= 0; i--) {
     select.remove(i);
  }

  const blank_option = document.createElement('option');
  blank_option.text = ""
  select.add(blank_option);

  for (const i2 in file_list) {

      const option = document.createElement('option');
      option.value = file_list[i2];
      option.text = file_list[i2];
      select.add(option);
  }
}

export function load_file() {
  alert("Boo");
}

async function getFileList(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const filelist_text = await response.text();
    const filelist = JSON.parse(filelist_text);

    let family_list = [];
    for (const i in filelist) {
      const filename = filelist[i];
      const family = filename.split('.')[0];
      family_list.push(family);
    }

    family_list.sort();
    load_files_into_select(family_list);
    return files;
  } catch (error) {
    console.error("Error fetching file list:", error);
    return [];
  }
}


export async function load_config_and_data(family_id, config_id) {

  console.log ("Family:" + family_id + " and config: " + config_id);

  const pedigree_file = '/family/' + family_id;
  const annotations_file = '/annotations/' + family_id;
  let config_file = '/config/basic';
  if (config_id) config_file = '/config/' + config_id;
  try {
    const [pedigree_response, annotations_response, config_response] = await Promise.all([
      fetch(pedigree_file),
      fetch(annotations_file),
      fetch(config_file)
    ]);

    if (!pedigree_response.ok || !config_response.ok) {
      throw new Error('One or more requests failed');
    }

    let annotations;
    console.log()
    if (annotations_response.ok) {
      annotations = await annotations_response.json();
      console.log(annotations);
    } else {
      console.log("No annotations file found.  This is okay and expected.  It means no one ever annotated this family.")
    }

    let data = await pedigree_response.json();
    let config = await config_response.json();

    return [data, annotations, config];

    // Process data1 and data2 here

  }  catch (error) {
    console.error('Error fetching data:', error);
//    throw new Error('One or more requests failed');
  }
}

export function save_positions_and_annotations(data) {
  console.log(data);

  const family_id = data.proband.split("-")[0];
  console.log(family_id);

  let people_positions = {};

  for (const person_id in data["people"]) {
    people_positions[person_id] = {};
    people_positions[person_id].x = data["people"][person_id].x;
    people_positions[person_id].y = data["people"][person_id].y;
  }
  console.log(people_positions);

  let annotations = {};
  annotations.positions = people_positions;
  save_file(family_id, annotations);
}

async function save_file(family_id, annotations) {
  console.log(JSON.stringify(annotations));
  const site_url = "write_annotations/" + family_id;
  try {
    const response = await fetch(site_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json' // Optional: indicates preference for JSON response
      },
      body: JSON.stringify(annotations)
    });

    console.log(response.ok);
//    if (!response.ok) {
//      throw new Error(`HTTP error! status: ${response.status}`);
//    }

    const responseData = await response.json();
    console.log('Success:', responseData);
    return responseData;

  } catch (error) {
    console.error('Error during fetch:', error);
    throw error; // Re-throw the error for further handling if needed
  }
}
