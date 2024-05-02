import re

from src.parser.TreeNode import FunctionNode

"""
This function recursively traverses the Abstract Syntax Tree (AST) for Python code,
capturing information about imports, classes, functions, and variable assignments. 
The captured information is stored in the provided `node_tree` object for easy property recall/retrieval.

Args:
    node (tree-sitter.Node): The current AST node being processed.
    code (bytes): The source code corresponding to the AST.
    node_tree (NodeTree): An object to store the extracted code structure information.
    language (tree-sitter.Language): The programming language of the code being parsed.
"""

def traverse_tree_python(node, code, node_tree, language):
    query_string = """
    (import_from_statement) @import_from
    (import_statement) @import
    (class_definition) @class
    (function_definition) @function
    (assignment) @variable
    """
    query = language.query(query_string)
    captures = query.captures(node)

    should_traverse_children = True
    for capture_node, capture_name in captures:
        if capture_node == node:
            should_traverse_children = False

    for capture_node, capture_index in captures:
        extracted_text = code[capture_node.start_byte : capture_node.end_byte].decode("utf-8").strip()

        if capture_index == "import":
            node_tree.imports.append(extracted_text)
        elif capture_index == "import_from":
            module_name = ' '.join([node.text.decode('utf-8') for node in capture_node.named_children if node.type == 'identifier'])
            import_name = capture_node.child_by_field_name('name').text.decode('utf-8')
            node_tree.imports.append(f"from {module_name} import {import_name}")
        elif capture_index == "class":
            class_name_match = re.search(r'class\s+(\w+)', extracted_text)
            if class_name_match:
                node_tree.class_names.append(class_name_match.group(1))
        elif capture_index == "function":
            function_details = extract_function_details_python(extracted_text)
            if function_details and not any(f.name == function_details.name for f in node_tree.functions):
                node_tree.functions.append(function_details)
        elif capture_index == "variable":
            if not node_tree.functions and not node_tree.class_names:
                node_tree.property_declarations.append(extracted_text)

    if should_traverse_children:
        for child in node.children:
            traverse_tree_python(child, code, node_tree, language)


def extract_function_details_python(text):
    func_name_match = re.search(r'def\s+(\w+)\s*\(', text)
    if func_name_match:
        func_name = func_name_match.group(1)
        parameters_match = re.search(r'\((.*?)\)', text)
        parameters = parameters_match.group(1).strip() if parameters_match else ""
        func_body_match = re.search(r':\s*\n(.*?)(^\s*$|\Z)', text, re.DOTALL | re.MULTILINE)
        func_body = func_body_match.group(1).strip() if func_body_match else ""

        return FunctionNode(
            name=func_name,
            parameters=parameters.split(",") if parameters else [],
            return_type="None",
            body=func_body
        )

    return None
