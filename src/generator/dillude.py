"""

"""
import json
import pathlib

def generate_individual_user_jsons(json_data):
    print("generate_individual_user_jsons ...")
    # Extract nodes and links from the data
    nodes = json_data['nodes']
    links = json_data['links']

    # Create a dictionary to hold nodes for each user
    user_nodes_dict = {}
    for node in nodes:
        user = node['user']
        if user not in user_nodes_dict:
            user_nodes_dict[user] = []
        user_nodes_dict[user].append(node)

    # Get the absolute path of the current script
    script_location = pathlib.Path(__file__).parent.absolute()
    # Construct the path to your assets directory
    assets_dir = script_location.parent.parent / 'assets/files/'
    # Make sure the directory exists
    assets_dir.mkdir(parents=True, exist_ok=True)

    # Initialize an empty dictionary to hold any output data
    file_json = {}

    # For each user, extract the relevant links and save the nodes and links in a separate JSON file
    for user, user_nodes in user_nodes_dict.items():
        user_links = [link for link in links if link['source'] in [node['id'] for node in user_nodes] and link['target'] in [node['id'] for node in user_nodes]]
        file_json = {
            'nodes': user_nodes,
            'links': user_links
        }

        file_path = assets_dir / f'{user}.json'
        print(f"Saving file tree: {file_path}")

        with open(file_path, 'w') as outfile:
            json.dump(file_json, outfile, indent=4, sort_keys=True)

    print("Individual user JSONs generated successfully!")
    return file_json


def generate_root_level_json(json_data):

    print(f"generate_root_level_json...")

    # Create a set of unique users
    users = {node['user'] for node in json_data['nodes']}

    # Initialize new nodes data structure
    new_nodes = [
        {
            'id': user,
            'description': user,
            'fileSize': sum(node['fileSize'] for node in json_data['nodes'] if node['user'] == user),
            'fileCount': sum(1 for node in json_data['nodes'] if node['user'] == user)  # Counting the files
        }
        for user in users
    ]

    # Initialize a set to store unique user-to-user links
    links = set()

    # Loop through the original links
    for link in json_data['links']:
        # Find the corresponding users for the source and target
        source_user = next(node['user'] for node in json_data['nodes'] if node['id'] == link['source'])
        target_user = next(node['user'] for node in json_data['nodes'] if node['id'] == link['target'])

        # Add the link to the set, if the source and target users are not the same
        if source_user != target_user:
            links.add((source_user, target_user))

    # Convert the set of links to the desired format
    new_links = [{'source': link[0], 'target': link[1]} for link in links]

    # Combine the new nodes and links into a new JSON object
    repo_json = {
        'nodes': new_nodes,
        'links': new_links
    }

    # Get the absolute path of the current script
    script_location = pathlib.Path(__file__).parent.absolute()

    # Construct the path to your assets directory
    assets_dir = script_location.parent.parent / 'assets'  # Going up two levels to the assets directory

    # Make sure the directory exists
    assets_dir.mkdir(parents=True, exist_ok=True)

    file_path = assets_dir / 'repos_graph.json'

    print("".format(file_path))
    with open(file_path, 'w') as outfile:
        print(f"{repo_json}")
        json.dump(repo_json, outfile, indent=4, sort_keys=True)

    return repo_json
