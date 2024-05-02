import re

from src.parser.TreeNode import FunctionNode

"""
This function recursively traverses the Abstract Syntax Tree (AST) for a C++ code,
capturing information about includes, namespaces, classes/structs, functions, and field
declarations. The captured information is stored in the provided `node_tree` object for
easy property recall/retrieval.

Args:
    node (tree-sitter.Node): The current AST node being processed.
    code (bytes): The source code corresponding to the AST.
    node_tree (NodeTree): An object to store the extracted code structure information.
    language (tree-sitter.Language): The programming language of the code being parsed.
"""

def traverse_tree_cpp(node, code, node_tree, language):
    cpp_function = None
    query_string = """
    (preproc_include) @include
    (namespace_definition) @namespace
    (struct_specifier) @struct
    (class_specifier) @class
    (function_definition) @function
    (declaration) @field
    """
    query = language.query(query_string)
    captures = query.captures(node)

    should_traverse_children = True
    for capture_node, capture_name in captures:
        if capture_node == node:
            should_traverse_children = False

    for capture_node, capture_index in captures:
        text = code[capture_node.start_byte : capture_node.end_byte].decode("utf-8").strip()

        if capture_index == "include":
            node_tree.imports.append(text)
        elif capture_index == "namespace":
            # Assuming the namespace can be nested or complex, this simplifies to a single namespace string
            namespace_name_match = re.search(r'namespace\s+([\w:]+)', text)
            if namespace_name_match:
                node_tree.package = namespace_name_match.group(1)
        elif capture_index in ["class", "struct"]:
            class_or_struct_match = re.search(r'\b(class|struct)\s+([\w<>,\s]+)', text)
            if class_or_struct_match:
                node_tree.class_names.append(class_or_struct_match.group(2).strip())
        elif capture_index == "function":
            function_details = extract_function_details_cpp(text, node_tree.class_names)
            if function_details and not any(f.name == function_details.name for f in node_tree.functions):
                node_tree.functions.append(function_details)
        elif capture_index == "field":
            node_tree.property_declarations.append(text)

    if should_traverse_children:
        for child in node.children:
            traverse_tree_cpp(child, code, node_tree, language)

def extract_function_details_cpp(text, class_names):
    func_name_match = re.search(r'(\w+)\s*\((.*)\)\s*(const)?\s*{?', text)
    parameters = func_name_match.group(2).strip() if func_name_match else ""
    func_name = func_name_match.group(1) if func_name_match else ""
    return_type_match = re.search(r'\w+\s+(\w+)', text.split('(')[0])
    return_type = return_type_match.group(1).strip() if return_type_match else "void"
    func_body_match = re.search(r'\{(.*)\}', text, re.DOTALL)
    func_body = func_body_match.group(1).strip() if func_body_match else ""

    return FunctionNode(
        name=func_name,
        parameters=parameters.split(","),
        return_type=return_type,
        body=func_body,
        class_names=class_names
    )
