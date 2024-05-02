import re

from src.parser.TreeNode import FunctionNode

"""
Traverses AST for Java code and extracts relevant information
such as imports, package, class/interface names, function name/parameters/body, etc...
The captured information is stored in the provided `node_tree` object for easy property recall/retrieval.

Args:
    node (tree-sitter.Node): The current AST node being processed.
    code (bytes): The source code corresponding to the AST.
    node_tree (NodeTree): An object to store the extracted information from the AST.
    language (tree-sitter.Language): The programming language of the code being parsed.
"""

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
