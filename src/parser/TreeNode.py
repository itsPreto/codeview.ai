class TreeNode:
    """
    Represents a node in the abstract syntax tree (AST).

    Attributes:
        file_path (str): The file path of the Python file.
        class_names (list): A list of class names defined in the file.
        package_import_paths (dict): A dictionary mapping package names to their import paths.
        package (str): The name of the package the file belongs to.
        imports (list): A list of import statements in the file.
        functions (list): A list of `FunctionNode` objects representing the functions defined in the file.
        property_declarations (list): A list of property declarations in the file.
        exports (list): A list of exported symbols from the file.
    """

    def __init__(
        self,
        file_path=None,
        class_names=None,
        package_import_paths=None,
        package=None,
        imports=None,
        functions=None,
        property_declarations=None,
        exports=None  # Add exports attribute if not already present
    ):
        self.file_path = file_path
        self.class_names = class_names or []
        self.package_import_paths = package_import_paths or {}
        self.package = package
        self.imports = imports or []  # Initialize imports list if not provided
        self.exports = exports or []  # Initialize exports list if not provided
        self.property_declarations = property_declarations or []
        self.functions = functions or []

    def to_dict(self):
        return {
            "file_path": self.file_path,
            "class_names": self.class_names,
            "imports": self.imports,
            "exports": self.exports,
            "package_import_paths": self.package_import_paths,
            "package": self.package,
            "property_declarations": self.property_declarations,
            "functions": [func.to_dict() for func in self.functions]
        }

    def __repr__(self):
        functions = "\n\n".join([str(func) for func in self.functions])
        return (
            f"TreeNode:\nFile Path:{self.file_path}\nClass Names: {self.class_names}\n"
            f"Imports: {self.imports}\nExports: {self.exports}\nProperties: {self.property_declarations}\n"
            f"Functions:\n{functions}\nPackage Paths:{self.package_import_paths}\nPackage: {self.package}"
        )


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
        self.parameters = parameters or []
        self.return_type = return_type
        self.body = body
        self.is_abstract = is_abstract
        self.class_name = " ".join(class_names) if class_names else ""
        self.annotations = annotations or []

    def to_dict(self):
        # Convert body to string assuming it's bytes, you might not need this depending on the actual type of `body`
        if isinstance(self.body, bytes):
            body = self.body.decode("utf-8")
        else:
            body = self.body
        return {
            "name": self.name,
            "parameters": self.parameters,
            "return_type": self.return_type,
            "body": body,
            "is_abstract": self.is_abstract,
            "class_name": self.class_name,
            "annotations": self.annotations,
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
        if isinstance(self.body, bytes):
            self.body = self.body.decode("utf-8")
        return json.dumps(self.__dict__, indent=4)
