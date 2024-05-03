import os
import subprocess
import logging
from flask import Flask, request, jsonify, session
from flask_cors import CORS
import threading
import subprocess


from src.generator.dillude import generate_individual_user_jsons, generate_root_level_json

from src.parser.process import process_modules

logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
app.secret_key = os.urandom(24).hex()
# Enable CORS for all domains on all routes
CORS(app)

def run_npm_start():
    """Run npm start in a subprocess."""
    subprocess.run(['npm', 'start'], cwd='.')


@app.route('/execute-command', methods=['POST'])
def execute_command():
    try:
        command = request.json['command']
        logging.info(f"Executing command: {command}")

        # Execute the command and capture output
        result = subprocess.run(
            command, shell=True, text=True, 
            capture_output=True, check=True
        )

        output = result.stdout
        errors = result.stderr

        print(f"Command output: {output}, errors: {errors}")
        return jsonify({'output': output, 'errors': errors})

    except subprocess.CalledProcessError as e:
        # Handle the case where the subprocess returns a non-zero exit status
        logging.error("Command failed", exc_info=True)
        return jsonify({'output': e.stdout, 'errors': e.stderr}), 400

    except Exception as e:
        logging.error("Error handling command", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/save-file', methods=['POST'])
def save_file():
    try:
        data = request.get_json()
        file_path = data.get('filePath')
        updated_content = data.get('updatedContent')
        
        if not file_path or not updated_content:
            return jsonify({'error': 'Missing file path or updated content'}), 400
        
        # Save the updated content to the file
        with open(file_path, 'w') as file:
            file.write(updated_content)
        
        return jsonify({'message': 'File saved successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get-file', methods=['GET'])
def get_file():
    try:
        file_path = request.args.get('filePath')
        
        if not file_path:
            return jsonify({'error': 'Missing file path'}), 400
        
        # Read the file content
        with open(file_path, 'r') as file:
            file_content = file.read()
        
        return file_content, 200
    except FileNotFoundError:
        return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500



@app.route('/process/local', methods=['POST'])
def process_local():
    """Process modules from a local path."""
    data = request.json
    local_path = data.get('path', './index/repos')
    try:
        # Assume process_modules is a function from your provided code
        _, _, _, _, json_data = process_modules(local_path)

        print(f"process_local: ${json_data}")
        generate_individual_user_jsons(json_data)
        print("generate_individual_user_jsons done.")
        generate_root_level_json(json_data)
        print("generate_root_level_json done.")
        return jsonify(json_data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/clone_and_process', methods=['POST'])
def clone_and_process():
    """Clone repositories from provided GitHub links and process them."""
    data = request.json
    repo_urls = data.get('repo_urls')
    if repo_urls:
        try:
            failed_clones = clone_repositories(repo_urls)
            if failed_clones:
                return jsonify({'error': 'Failed to clone some repositories', 'details': failed_clones}), 500
            _, _, _, _, json_data = process_modules('./index/repos')
            generate_individual_user_jsons(json_data)
            generate_root_level_json(json_data)
            return jsonify(json_data), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    return jsonify({'error': 'Repo URLs are required'}), 400

@app.route('/get-last-modified/<json_file_name>')
def get_last_modified(json_file_name):
    path = os.path.join(app.root_path, 'assets', json_file_name)
    try:
        last_modified = os.path.getmtime(path)
        print(f"file {path} last modified: {last_modified}")
        return jsonify({'last_modified': last_modified}), 200
    except OSError:
        return jsonify({'error': 'File not found'}), 404

def clone_repositories(repo_urls):
    base_path = './index/repos'
    os.makedirs(base_path, exist_ok=True)
    failed_clones = []

    for repo_url in repo_urls:
        repo_name = repo_url.split('/')[-1].replace('.git', '')
        repo_path = os.path.join(base_path, repo_name)
        if not os.path.exists(repo_path):
            clone_command = f"git clone {repo_url} {repo_path}"
            result = subprocess.run(clone_command, shell=True, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
            if result.returncode != 0:
                print(f"Failed to clone {repo_url}")
                failed_clones.append(repo_url)
            else:
                print(f"Successfully cloned {repo_url}")
        else:
            print(f"Repository {repo_name} already exists at {repo_path}")

    return failed_clones

def main():
    print("Do you want to link a local path or clone repositories? If your repositories are already in './index/repos/', press Enter twice to proceed with them.")
    user_choice = input("Enter 'local', 'clone', or press Enter to skip: ").strip().lower()

    json_data = {}
    if user_choice == "local":
        local_path = input("Enter the local path to your repository or folder containing repositories: ")
        if local_path:  # Check if user entered something
            if os.path.exists(local_path):
                _,_,_,_,json_data = process_modules(local_path)
            else:
                print("The path provided does not exist. Please check and try again.")
        else:
            print("No path entered. Proceeding with the default path './index/repos/'.")
            _,_,_,_,json_data = process_modules('./index/repos')

    elif user_choice == "clone":
        repo_urls = []
        while True:
            repo_url = input("Enter the URL for a repository or press Enter to finish: ")
            if repo_url:
                repo_urls.append(repo_url)
            else:
                break
        if repo_urls:
            missing_or_failed = clone_repositories(repo_urls)
            if missing_or_failed:
                print("Some repositories failed to clone:", missing_or_failed)
        _,_,_,_,json_data = process_modules('./index/repos')

    elif not user_choice:
        print("No input provided. Assuming repositories are ready in './index/repos/'.")
        _,_,_,_,json_data = process_modules('./index/repos')
    else:
        print("Invalid option selected. Please try again.")

    generate_individual_user_jsons(json_data)
    generate_root_level_json(json_data)
    

def run_npm_start():
    """Run npm start in a subprocess."""
    subprocess.run(['npm', 'start'], cwd='.')

if __name__ == "__main__":
    # Run npm start in a separate thread to avoid blocking Flask
    threading.Thread(target=run_npm_start).start()
    app.run(host="0.0.0.0", port=8000)
    # main()