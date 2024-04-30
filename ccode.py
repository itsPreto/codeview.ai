import glob
import json
import os
import re
import subprocess
import shlex
import logging
import sys
from flask_sockets import Sockets
import pathlib
from tree_sitter import Parser, Language
import pexpect
from flask import Flask, request, jsonify, session
from flask_cors import CORS
import threading
import subprocess

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
    path = os.path.join(app.root_path, 'data', json_file_name)
    try:
        last_modified = os.path.getmtime(path)
        return jsonify({'last_modified': last_modified}), 200
    except OSError:
        return jsonify({'error': 'File not found'}), 404

class FunctionNode:
    def __init__(
        self,
        name,
        parameters,
        return_type,
        body,
        is_abstract=False,
        class_names=None,
        annotations=None,
    ):
        self.name = name
        self.parameters = parameters
        self.return_type = return_type
        self.body = body
        self.is_abstract = is_abstract
        self.class_name = " ".join(class_names)
        self.annotations = annotations or []

    def to_dict(self):
        # Convert body to string assuming it's bytes, you might not need this depending on the actual type of `body`
        if isinstance(self.body, bytes):
            body = self.body.decode("utf-8")
        else:
            body = self.body
        return {
            "name": self.name or "",
            "parameters": self.parameters or "",
            "return_type": self.return_type or "",
            "body": self.body.decode("utf-8") if isinstance(self.body, bytes) else (self.body or ""),
            "is_abstract": self.is_abstract or "",
            "class_name": self.class_name or "",
            "annotations": self.annotations or [],
        }

    def __repr__(self):
        parameter_str = ", ".join(self.parameters)
        return (
            f"\n\n------ Name: {self.name}\n------ Parameters: {parameter_str}\n------ Return Type: "
            f"{self.return_type}\n------ Body:\t{self.body}"
            f"\n------ Abstract:\t{self.is_abstract}\n"
            f"\n------ Annotations:\t{self.annotations}\n------ Class Name:\t{self.class_name}"
        )

    def to_json(self):
        self.body = self.body.decode("utf-8")
        return json.dumps(self.__dict__, indent=4)

class TreeNode:
    def __init__(
        self,
        file_path=None,
        class_names=None,
        package_import_paths=None,
        package=None,
        imports=None,
        functions=None,
        property_declarations=None,
    ):
        self.file_path = file_path
        self.class_names = class_names or []
        self.imports = imports or []
        self.package_import_paths = package_import_paths or {}
        self.package = package
        self.property_declarations = property_declarations or []
        self.functions = functions or []

    def to_dict(self):
        return {
            "file_path": self.file_path,
            "class_names": self.class_names,
            "imports": self.imports,
            "package_import_paths": self.package_import_paths,
            "package": self.package,
            "property_declarations": self.property_declarations,
            "functions": [
                func.to_dict() for func in self.functions
            ],  # Convert each FunctionNode to a dictionary
        }

    def __repr__(self):
        functions = "\n\n".join([str(func) for func in self.functions])

        return (
            f"TreeNode:\nFile Path:{self.file_path}\n\nClass Name: {self.class_names}\n\nProperties:\n"
            f"{self.property_declarations}\n\nFunctions:\n{functions}\n"
            f"Package Paths:{self.package_import_paths}\n\nPackage: {self.package}"
        )

def clone_repositories(base_path):

    # List of repository names to clone
    repo_names = [
        "inseatdevice", "deviceowner", "sharedfunctions", "flightsignalservice", 
        "itu-cmp", "networktestingtool", "offload-messaging", "crew-management-panel", 
        "bit-service", "event-offload-adaptor", "wap-interface-service", "maintenance-service", 
        "clbridge_a01", "server-interface-matrix", "inflight-data-transfer", "networkscheduler-service", 
        "aircraft-audio-bridge", "data-cache-service", "clbridge", "file-server", "redundancyservice", 
        "seatstate-service", "logging-service", "software-update-service", "overhead-display-bridge", 
        "overhead-display-bridge", "maven-plugins", "autopilot-messaging", "autopilot-itu-controller", 
        "autopilothooks", "autopilot-itu", "factoryacceptancetestsuite"
    ]
    # Create the base path directory if it does not exist
    os.makedirs(base_path, exist_ok=True)
    
    # Define the base URL for cloning
    base_url = "git@bitbucket.org:deltaflightproducts/"
    
    # Initialize a list to track failed clones
    failed_clones = []
    
    # Loop through the repository names
    for repo_name in repo_names:
        # Construct the full path to the repository directory
        repo_path = os.path.join(base_path, repo_name)
        
        # Check if the repository directory does not exist
        if not os.path.exists(repo_path):
            # Construct the git clone command
            clone_command = f"git clone {base_url}{repo_name}.git {repo_path}"
            
            # Execute the clone command
            result = subprocess.run(clone_command, shell=True, stderr=subprocess.PIPE)
            
            # Check if the clone failed
            if result.returncode != 0:
                print(f"Failed to clone {repo_name}")
                failed_clones.append(repo_name)
        else:
            print(f"Repository {repo_name} already exists.")
    
    return failed_clones

def process_modules(root_dir):

    logging.basicConfig(level=logging.INFO)

    JAVA_LANGUAGE = Language("languages.so", "java")
    KOTLIN_LANGUAGE = Language("languages.so", "kotlin")
    modules = {}
    file_trees = {}
    total_functions_count = 0
    file_sizes = {}
    package_names = {}  # Add a new dictionary to store the package names

    readme_info_list = []  # List to store the README information

    directories = [os.path.join(root_dir, d) for d in os.listdir(root_dir) if os.path.isdir(os.path.join(root_dir, d))]
    total_directories = len(directories)
    processed_directories = 0
    
    for dir_name in os.listdir(root_dir):
        # logger.info(f"Processing module: {dir_name}")
        module_dir = os.path.join(root_dir, dir_name)
        processed_directories += 1
        progress = (processed_directories / total_directories) * 100

        logging.info(f"Processing {dir_name}: {progress:.2f}% complete")
        if not os.path.isdir(module_dir):
            continue

        # Try to locate a README file in the repository
        readme_files = [name for name in os.listdir(module_dir) if "README" in name.upper()]
        for readme_file in readme_files:
            readme_path = os.path.join(module_dir, readme_file)
            with open(readme_path, 'r', encoding='utf-8') as file:
                content = file.read()
                # Create a dictionary with the required structure and append it to the list
                readme_info = {
                    "id": f"{dir_name}",
                    "content": content
                }
                readme_info_list.append(readme_info)

        module_files = {}
        for ext in ("*.java", "*.kt"):
            for file_path in glob.glob(
                os.path.join(module_dir, "**", ext), recursive=True
            ):
                if "_" in os.path.basename(file_path) or "build" in file_path:
                    continue
                lastknownpath = file_path
                with open(file_path, "r") as f:
                    file_content = f.read()
                if file_path.endswith(".java"):
                    java_node_tree = process_code_string(file_content, JAVA_LANGUAGE, file_path)

                    # Debug: Print the type of the returned object
                    # print(f"Returned type for Java file {file_path}: {type(java_node_tree)}")

                    if isinstance(java_node_tree, TreeNode):  # Replace 'TreeNode' with your expected class type
                        total_functions_count += len(java_node_tree.functions)
                        file_trees[file_path] = java_node_tree
                        # print(f"file_trees type is: {type(file_trees)}")
                        package_names[file_path] = java_node_tree.package
                    else:
                        # Handle or log the unexpected case
                        print(f"Unexpected type returned for file {file_path}. Expected TreeNode, got {type(java_node_tree)}")

                elif file_path.endswith(".kt"):
                    kotlin_node_tree = process_code_string(file_content, KOTLIN_LANGUAGE, file_path)

                    # Debug: Print the type of the returned object
                    # print(f"Returned type for Kotlin file {file_path}: {type(kotlin_node_tree)}")

                    if isinstance(kotlin_node_tree, TreeNode):  # Replace 'TreeNode' with your expected class type
                        total_functions_count += len(kotlin_node_tree.functions)
                        file_trees[file_path] = kotlin_node_tree
                        # print(f"file_trees type is: {type(file_trees[file_path])}")
                        package_names[file_path] = kotlin_node_tree.package
                    else:
                        # Handle or log the unexpected case
                        print(f"Unexpected type returned for file {file_path}. Expected TreeNode, got {type(kotlin_node_tree)}")

                module_files[file_path] = file_content
                file_sizes[file_path] = len(file_content.encode("utf-8")).__float__()

        if module_files and len(module_files) >= 10:
            modules[dir_name] = module_files

    save_file_trees(file_trees)

    dependencies = {}
    links = [{"source": "target"}]

    for file_path, node_tree in file_trees.items():
        # print(f"file_trees type is: {type(file_trees[file_path])}")
        if (
            node_tree.class_names is None
            and node_tree.functions is None
            and node_tree.property_declarations is None
        ):
            continue
        file_dependencies = []
        for other_file_path, other_node_tree in file_trees.items():
            if file_path == other_file_path:
                continue

            other_imports = other_node_tree.imports

            if node_tree.class_names is None:
                node_tree.class_names = os.path.basename(file_path)

            # Check if the file package + each of the function names is in the other file's import list
            for path in node_tree.package_import_paths:
                if path in other_imports:
                    file_dependencies.append(other_file_path)
                    links.append({"source": other_file_path, "target": file_path})

        dependencies[file_path] = list(set(file_dependencies))

    nodes = []
    for file_path, package_name in package_names.items():
        print(f"filepath: {file_path}")
        print(f"package_name: {package_name}")
        node = {
            "id": file_path,
            "user": extract_component_name(file_path),
            "description": "",
            "fileSize": os.path.getsize(file_path),
        }
        nodes.append(node)

        # At the end of your process_modules function, before the return statement:

    json_data = {"nodes": nodes, "links": links[1:]}

    # Get the absolute path of the current script
    script_location =  pathlib.Path(__file__).parent.absolute()

    # # Make sure the directory exists (as before)
    # assets_dir.mkdir(parents=True, exist_ok=True)

    # Define the file path
    file_path = "./assets/files_graph.json"


    with open(file_path, "w") as outfile:
        # print(f"{json_data}")
        json.dump(json_data, outfile, indent=4, sort_keys=True)

    # Save the README information in a single JSON file
    readme_json_path = "./assets/repos_readme.json"
    with open(readme_json_path, 'w', encoding='utf-8') as file:
        json.dump(readme_info_list, file, ensure_ascii=False, indent=4)

    return modules, file_sizes, package_names, file_trees, json_data

def extract_class_name(code_segment):
    identifier_pattern = re.compile(r"\b(identifier)\b")
    match = identifier_pattern.search(code_segment)
    if match:
        start = match.end() + 1
        end = start + code_segment[start:].find(" ")
        return code_segment[start:end]
    return None

def append_to_package_import_paths(package, name, node_tree):
    package_import_path = f"{package}.{name}".strip("package ")
    node_tree.package_import_paths[package_import_path] = package_import_path

def extract_property_name(property_declaration):
    pattern = (
        r"\b(?:(?:public|private|protected)\s+)*(?:(?:static|final)\s+)*[a-zA-Z_]"
        r"\w*(?:<.*>)?(?:\[\])?\s+([a-zA-Z_]\w*)|(?:(?:val|var))\s+([a-zA-Z_]\w*)"
    )

    match = re.search(pattern, property_declaration)
    if match:
        java_prop_name = match.group(1)
        kotlin_prop_name = match.group(2)
        return java_prop_name or kotlin_prop_name

    return None

def traverse_tree_java(node, code, node_tree, language):
    java_function = None
    query_string = """
    (import_declaration) @import
    (package_declaration) @package
    (class_declaration name: (identifier) @name) @class
    (annotation) @annotation
    (interface_declaration name: (identifier) @name) @interface
    (field_declaration) @field
    (method_declaration) @method
    """

    query = language.query(query_string)
    captures = query.captures(node)

    should_traverse_children = True
    for capture_node, capture_name in captures:
        if capture_node == node:
            should_traverse_children = False

    for capture_node, capture_index in captures:
        if capture_index == "import":
            node_tree.imports.append(
                code[capture_node.start_byte : capture_node.end_byte]
                .decode("utf-8")
                .strip()
            )

        elif capture_index == "package":
            node_tree.package = (
                code[capture_node.start_byte : capture_node.end_byte]
                .decode("utf-8")
                .strip()
            )

        elif capture_index in ["class", "class_public", "class_abstract"]:
            class_name_match = re.search(
                r"\b(?:class|interface)\s+([a-zA-Z_]\w*)",
                code[capture_node.start_byte : capture_node.end_byte].decode("utf-8"),
            )
            if class_name_match:
                class_name = class_name_match.group(1)
                node_tree.class_names.append(class_name)

        elif capture_index == "field":
            property_declaration = (
                code[capture_node.start_byte : capture_node.end_byte]
                .decode("utf-8")
                .strip()
            )
            node_tree.property_declarations.append(property_declaration)

        elif capture_index == "annotation":
            annotation_text = (
                code[capture_node.start_byte : capture_node.end_byte]
                .decode("utf-8")
                .strip()
            )
            if java_function:  # Add this line
                java_function.annotations.append(annotation_text)

        elif capture_index == "method":
            method_code = code[capture_node.start_byte : capture_node.end_byte].decode(
                "utf-8"
            )
            # Update the regex to exclude the annotations
            func_name_match = re.search(
                r"\b(?:public|protected|private|static|final|abstract|synchronized|native|strictfp)?\s*(\w+)\s*\(",
                method_code,
            )
            if func_name_match:
                func_name_and_params = func_name_match.group(0)
                func_name = re.sub(
                    r"\s*\(", "(", func_name_and_params.split("(")[0]
                ).strip()
                parameters = (
                    func_name_and_params.split("(", 1)[-1].rsplit(")", 1)[0].strip()
                )
                return_type_match = re.search(r"\)\s*:\s*(\w+)", method_code)
                return_type = (
                    return_type_match.group(1) if return_type_match else "void"
                )

                func_body_match = re.search(r"\{(.*)\}", method_code, re.DOTALL)
                func_body = func_body_match.group(1).strip() if func_body_match else ""

                java_function = FunctionNode(
                    func_name,
                    parameters.split(","),
                    return_type,
                    func_body,
                    class_names=node_tree.class_names,
                )

                # Check for duplicates
                duplicate_found = any(
                    func.name == java_function.name
                    and func.return_type == java_function.return_type
                    and func.parameters == java_function.parameters
                    for func in node_tree.functions
                )

                if not duplicate_found:
                    node_tree.functions.append(java_function)

    if should_traverse_children:
        for child_node in node.children:
            traverse_tree_java(child_node, code, node_tree, language)
    else:
        # Append class names, function names, and property names to package_import_paths
        if node_tree.package:
            package_name = node_tree.package.replace(";", "").strip()
            if node_tree.class_names:
                for class_name in node_tree.class_names:
                    append_to_package_import_paths(package_name, class_name, node_tree)
            if node_tree.functions:
                for function in node_tree.functions:
                    append_to_package_import_paths(
                        package_name, function.name, node_tree
                    )
            if node_tree.property_declarations:
                for property_declaration in node_tree.property_declarations:
                    property_name = extract_property_name(property_declaration)
                    if property_name:
                        append_to_package_import_paths(
                            package_name, property_name, node_tree
                        )

def traverse_tree_kt(node, code, node_tree, language):
    kotlin_function = None
    query_string = """
    (import_list) @import
    (package_header) @package
    (class_declaration) @class_or_interface
    (annotation) @annotation
    (object_declaration) @object_declaration
    (property_declaration) @field
    (function_declaration) @function
    """

    query = language.query(query_string)
    captures = query.captures(node)

    should_traverse_children = True
    for capture_node, capture_name in captures:
        if capture_node == node:
            should_traverse_children = False

    is_data_class = False
    for capture_node, capture_index in captures:
        if capture_index == "import":
            node_tree.imports = (
                code[capture_node.start_byte : capture_node.end_byte]
                .decode("utf-8")
                .strip()
            ).split("\n")

        elif capture_index == "package":
            node_tree.package = (
                code[capture_node.start_byte : capture_node.end_byte]
                .decode("utf-8")
                .strip()
            )

        elif capture_index == "class_or_interface":
            class_code = code[capture_node.start_byte : capture_node.end_byte].decode(
                "utf-8"
            )
            class_name_match = re.search(
                r"\b(?:sealed\s+class|data\s+class|class|interface)\s+([a-zA-Z_]\w*)",
                class_code,
            )
            if class_name_match:
                class_name = class_name_match.group(1)
                is_data_class = "data class" in class_code
                node_tree.class_names.append(f"{class_name}")
                node_tree.is_interface = "interface" in class_code

                # Extract data class fields
                if is_data_class:
                    # Modified regular expression to capture the entire line for each property
                    fields = re.findall(
                        r"\b(val|var)\s+([a-zA-Z_]\w*\s*:\s*[a-zA-Z_]\w*(\??)(<.*>)?(\??))",
                        class_code,
                    )
                    node_tree.property_declarations = (
                        ",\n".join(" ".join(f) for f in fields)
                    ).split("\n")

        elif capture_index == "annotation":
            annotation_text = (
                code[capture_node.start_byte : capture_node.end_byte]
                .decode("utf-8")
                .strip()
            )
            if kotlin_function:
                kotlin_function.annotations.append(annotation_text)

        # Added extraction of object declarations
        elif capture_index == "object_declaration":
            object_name_match = re.search(
                r"\b(?:object)\s+([a-zA-Z_]\w*)",
                code[capture_node.start_byte : capture_node.end_byte].decode("utf-8"),
            )
            if object_name_match:
                object_name = object_name_match.group(1)
                node_tree.class_names.append(object_name)

        elif capture_index == "field" and not is_data_class:
            property_declaration = (
                code[capture_node.start_byte : capture_node.end_byte]
                .decode("utf-8")
                .strip()
            )
            node_tree.property_declarations.append(property_declaration)

        elif capture_index == "function":
            function_code = code[
                capture_node.start_byte : capture_node.end_byte
            ].decode("utf-8")
            func_name_match = re.search(
                r"\b(?:fun)\s+(?:[a-zA-Z_]\w*\.)*([a-zA-Z_]\w*)", function_code
            )
            if func_name_match:
                func_name = func_name_match.group(1)
                parameters_match = re.search(r"\((.*?)\)", function_code)
                parameters = parameters_match.group(1) if parameters_match else ""
                return_type_match = re.search(
                    r":\s*([a-zA-Z_][\w<>,.? ]*)", function_code
                )
                return_type = (
                    return_type_match.group(1).strip() if return_type_match else "Unit"
                )
                func_body_match = re.search(r"\{(.*)\}", function_code, re.DOTALL)
                func_body = func_body_match.group(1).strip() if func_body_match else ""
                kotlin_function = FunctionNode(
                    func_name,
                    parameters.split(","),
                    return_type,
                    func_body,
                    class_names=node_tree.class_names,
                )

                # Check for duplicates
                duplicate_found = any(
                    func.name == kotlin_function.name
                    and func.return_type == kotlin_function.return_type
                    and func.parameters == kotlin_function.parameters
                    for func in node_tree.functions
                )
                if not duplicate_found:
                    node_tree.functions.append(kotlin_function)
    if should_traverse_children:
        for child in node.children:
            traverse_tree_kt(child, code, node_tree, language)
    else:
        # Append class names, function names, and property names to package_import_paths
        if node_tree.package:
            package_name = node_tree.package.replace(";", "").strip()
            if node_tree.class_names:
                for class_name in node_tree.class_names:
                    append_to_package_import_paths(package_name, class_name, node_tree)
            if node_tree.functions:
                for function in node_tree.functions:
                    append_to_package_import_paths(
                        package_name, function.name, node_tree
                    )
            if node_tree.property_declarations:
                for property_declaration in node_tree.property_declarations:
                    property_name = extract_property_name(property_declaration)
                    if property_name:
                        append_to_package_import_paths(
                            package_name, property_name, node_tree
                        )

def process_code_string(code_string, language, file_path):
    if "java" in language.name:
        parser = Parser()
        parser.set_language(language)
        tree = parser.parse(bytes(code_string, "utf8"))
        root_node = tree.root_node

        java_node_tree = TreeNode()
        # print(f"file_path: {file_path}")
        traverse_tree_java(
            root_node, bytes(code_string, "utf8"), java_node_tree, language
        )
        class_name_set = set(java_node_tree.class_names)
        import_set = set(java_node_tree.imports)
        properties_set = set(java_node_tree.property_declarations)
        java_node_tree.file_path = file_path
        java_node_tree.imports = "\n".join(import_set)
        java_node_tree.class_names = list(class_name_set)
        java_node_tree.property_declarations = list(properties_set)
        return java_node_tree

    elif "kotlin" in language.name:
        parser = Parser()
        parser.set_language(language)
        tree = parser.parse(bytes(code_string, "utf8"))
        root_node = tree.root_node

        kotlin_node_tree = TreeNode()
        # print(f"file_path: {file_path}")
        traverse_tree_kt(
            root_node, bytes(code_string, "utf8"), kotlin_node_tree, language
        )

        class_name_set = set(kotlin_node_tree.class_names)
        import_set = set(kotlin_node_tree.imports)
        properties_set = set(kotlin_node_tree.property_declarations)
        kotlin_node_tree.imports = "\n".join(import_set)
        kotlin_node_tree.file_path = file_path
        kotlin_node_tree.class_names = list(class_name_set)
        kotlin_node_tree.property_declarations = list(properties_set)
        return kotlin_node_tree

    else:
        raise ValueError("Invalid language. Only 'Java' and 'Kotlin' are supported.")

def extract_last_three_segments(full_name):
    segments = full_name.split(".")
    return ".".join(segments[1:])

def save_file_trees(file_trees) -> None:

    # Get the absolute path of the current script
    script_location = pathlib.Path(__file__).parent.absolute()

    # Construct the path to your assets directory
    assets_dir = (
        script_location / "index"
    )  # Going up two levels to the assets directory

    # Make sure the directory exists (as before)
    assets_dir.mkdir(parents=True, exist_ok=True)

    # Define the file path
    file_path = assets_dir / "repos_file_trees.json"

    with open(file_path, "w") as file:
        # Serialize using the to_dict method to get proper dictionary representations of your objects
        file_trees_as_dicts = []
        for file_path, tree_node in file_trees.items():
                # print(f"SAVING FILE-TREE:{type(tree_node)}")
                file_trees_as_dicts.append(tree_node.to_dict())
        json.dump(
            file_trees_as_dicts, file, indent=4
        )  # You might want to use indent for better formatting

def load_file_trees():
    try:
        with open("file_trees.json", "r") as file:
            file_trees = json.load(file)
        return file_trees
    except FileNotFoundError:
        return {}  # Return an empty dictionary if the file doesn't exist

def extract_component_name(file_path):
    # This regex will capture the name right before 'app/src' or 'src'
    match = re.search(r"/([^/]+)/(?:app/)?src/", file_path)
    if match:
        return match.group(1)  # Return the captured group which is the component name
    return None  # Return None if no match is found

def generate_individual_user_jsons(json_data):

    print(f"generate_individual_user_jsons ...")

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
    assets_dir = script_location / 'assets/files/'  # Going up two levels to the assets directory

    print(assets_dir)

    # Make sure the directory exists
    assets_dir.mkdir(parents=True, exist_ok=True)
    # For each user, extract the relevant links and save the nodes and links in a separate JSON file
    for user, user_nodes in user_nodes_dict.items():
        user_links = [
            link for link in links
            if link['source'] in [node['id'] for node in user_nodes]
            and link['target'] in [node['id'] for node in user_nodes]
        ]
        
        file_json = {
            'nodes': user_nodes,
            'links': user_links
        }

        file_path = assets_dir / f'{user}.json'
        print(f"SAVING FILE-TREE:{file_path}")

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
    assets_dir = script_location / 'assets'  # Going up two levels to the assets directory

    # Make sure the directory exists
    assets_dir.mkdir(parents=True, exist_ok=True)

    file_path = assets_dir / 'repos_graph.json'

    print("".format(file_path))
    with open(file_path, 'w') as outfile:
        print(f"{repo_json}")
        json.dump(repo_json, outfile, indent=4, sort_keys=True)

    return repo_json

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
    app.run(host="0.0.0.0", port=7000)