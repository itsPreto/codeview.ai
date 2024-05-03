
import re
import os
import glob
import json
import pathlib
import logging
from tree_sitter import Parser, Language
from src.parser.TreeNode import TreeNode
from src.parser.languages.c import traverse_tree_c
from src.parser.languages.java import traverse_tree_java
from src.parser.languages.kt import traverse_tree_kt
from src.parser.languages.go import traverse_tree_go
from src.parser.languages.py import traverse_tree_python
from src.parser.languages.js import traverse_tree_js
from src.parser.languages.cpp import traverse_tree_cpp

logging.basicConfig(level=logging.DEBUG)

def process_modules(root_dir):

    # Updated language mapping to include lists of extensions
    extension_to_language = {
        "java": (Language("languages.so", "java"), [".java"]),
        "kotlin": (Language("languages.so", "kotlin"), [".kt"]),
        "javascript": (Language("languages.so", "javascript"), [".js", ".jsx"]),
        "go": (Language("languages.so", "go"), [".go"]),
        "python": (Language("languages.so", "python"), [".py"]),
        "cpp": (Language("languages.so", "cpp"), [".cpp", ".cc", ".cxx"]),
        "c": (Language("languages.so", "c"), [".c"])
    }

    modules = {}
    file_trees = {}
    file_sizes = {}
    package_names = {}
    readme_info_list = []
    directories = [os.path.join(root_dir, d) for d in os.listdir(root_dir) if os.path.isdir(os.path.join(root_dir, d)) and not should_skip_path(os.path.join(root_dir, d))]
    total_directories = len(directories)
    processed_directories = 0
    

    for dir_name in directories:
        module_dir = dir_name
        processed_directories += 1
        logging.info(f"Processing {dir_name}: {(processed_directories / total_directories) * 100:.2f}% complete")

        readme_files = [name for name in os.listdir(module_dir) if "README" in name.upper()]
        for readme_file in readme_files:
            readme_path = os.path.join(module_dir, readme_file)
            with open(readme_path, 'r', encoding='utf-8') as file:
                content = file.read()
                readme_info_list.append({"id": os.path.basename(module_dir), "content": content})

        module_files = {}
        for lang, (language_obj, extensions) in extension_to_language.items():
            for ext in extensions:
                for file_path in glob.glob(os.path.join(module_dir, "**", f"*{ext}"), recursive=True):
                    if should_skip_path(file_path):  # Use the function to check each file path
                        continue
                    with open(file_path, "r") as f:
                        file_content = f.read()

                    node_tree = process_code_string(file_content, language_obj, file_path)
                    if isinstance(node_tree, TreeNode):
                        file_trees[file_path] = node_tree
                        package_names[file_path] = "/".join(pathlib.Path(file_path).parts[:-1])
                        module_files[file_path] = file_content
                        file_sizes[file_path] = len(file_content.encode("utf-8")).__float__()

        if module_files:
            modules[os.path.basename(module_dir)] = module_files

    print("Calling save_file_trees()")
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
        match = re.search(r"/([^/]+)/(?:[^/]+/)?src/", file_path)
        user = match.group(1) if match else "Unknown"
        node = {
            "id": file_path,
            "user": user,
            "package": package_name,
            "description": "",
            "fileSize": os.path.getsize(file_path),
        }
        nodes.append(node)

    json_data = {"nodes": nodes, "links": links[1:]}


    # Get the absolute path of the current script
    script_location =  pathlib.Path(__file__).parent.absolute()

    # # Make sure the directory exists (as before)
    # assets_dir.mkdir(parents=True, exist_ok=True)

    # Define the file path
    file_path = "./assets/full_graph.json"


    with open(file_path, "w") as outfile:
        # print(f"{json_data}")
        json.dump(json_data, outfile, indent=4, sort_keys=True)

    # Save the README information in a single JSON file
    readme_json_path = "./assets/repos_readme.json"
    with open(readme_json_path, 'w', encoding='utf-8') as file:
        json.dump(readme_info_list, file, ensure_ascii=False, indent=4)

    return modules, file_sizes, package_names, file_trees, json_data


def should_skip_path(path):
    skip_directories = [
        'node_modules', 'build', 'dist', 'out', 'bin', '.git', '.svn', '.vscode',
        '__pycache__', '.idea', 'obj', 'lib', 'vendor', 'target', '.next', 'pkg',
        'venv', '.tox', 'wheels', 'Debug', 'Release', 'deps'
    ]
    # Ensure we check against complete directory names in the path
    return any(skip_dir in path.split(os.path.sep) for skip_dir in skip_directories)


def process_code_string(code_string, language, file_path):
    parser = Parser()
    parser.set_language(language)
    tree = parser.parse(bytes(code_string, "utf8"))
    root_node = tree.root_node

    node_tree = TreeNode()

    # Process each language with its corresponding function
    if language.name == "java":
        traverse_tree_java(root_node, bytes(code_string, "utf8"), node_tree, language)
    elif language.name == "kotlin":
        traverse_tree_kt(root_node, bytes(code_string, "utf8"), node_tree, language)
    elif language.name == "javascript":
        traverse_tree_js(root_node, bytes(code_string, "utf8"), node_tree, language)
    elif language.name == "go":
        traverse_tree_go(root_node, bytes(code_string, "utf8"), node_tree, language)
    elif language.name == "python":
        traverse_tree_python(root_node, bytes(code_string, "utf8"), node_tree, language)
    elif language.name == "cpp":
        traverse_tree_cpp(root_node, bytes(code_string, "utf8"), node_tree, language)
    elif language.name == "c":
        traverse_tree_c(root_node, bytes(code_string, "utf8"), node_tree, language)
    else:
        raise ValueError(f"Unsupported language: {language.name}")


    class_name_set = set(node_tree.class_names)
    import_set = set(node_tree.imports)
    properties_set = set(node_tree.property_declarations)
    node_tree.imports = "\n".join(import_set)
    node_tree.file_path = file_path
    node_tree.class_names = list(class_name_set)
    node_tree.property_declarations = list(properties_set)

    return node_tree



def save_file_trees(file_trees) -> None:

    # Get the absolute path of the current script
    script_location = pathlib.Path(__file__).parent.absolute()

    # Construct the path to your assets directory
    assets_dir = (
        script_location.parent.parent / "index"
    )  # Going up two levels to the assets directory

    # Make sure the directory exists (as before)
    assets_dir.mkdir(parents=True, exist_ok=True)

    # Define the file path
    file_path = assets_dir / "file_trees.json"

    print(f"SAVING FILE TREES....")
    with open(file_path, "w") as file:
        print(f"SAVING TREE FOR file_path: {file_path}")
        # Serialize using the to_dict method to get proper dictionary representations of your objects
        file_trees_as_dicts = []
        for file_path, tree_node in file_trees.items():
                # print(f"SAVING FILE-TREE:{type(tree_node)}")
                file_trees_as_dicts.append(tree_node.to_dict())
        json.dump(
            file_trees_as_dicts, file, indent=4
        )  # You might want to use indent for better formatting

