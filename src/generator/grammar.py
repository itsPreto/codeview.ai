import tree_sitter as tspython
from tree_sitter import Language, Parser

# clone grammars as needed and update script:
# git clone https://github.com/tree-sitter/tree-sitter-go
# git clone https://github.com/tree-sitter/tree-sitter-javascript
# git clone https://github.com/tree-sitter/tree-sitter-python
# git clone https://github.com/tree-sitter/tree-sitter-c
# git clone https://github.com/tree-sitter/tree-sitter-cpp
# git clone https://github.com/tree-sitter/tree-sitter-java
# git clone https://github.com/tree-sitter/tree-sitter-kotlin
# ...

# Build the shared library with grammar for all languages
# Language.build_library(
#     "../../languages.so",
#     [
#         "./tree-sitter-go", 
#         "./tree-sitter-javascript", 
#         "./tree-sitter-python", 
#         "./tree-sitter-cpp", 
#         "./tree-sitter-c", 
#         "./tree-sitter-java", 
#         "./tree-sitter-kotlin"
#     ]
# )

# Initialize languages
LANGUAGES = {
    "go": Language("../../languages.so", "go"),
    "javascript": Language("../../languages.so", "javascript"),
    "python": Language("../../languages.so", "python"),
    "cpp": Language("../../languages.so", "cpp"),
    "c": Language("../../languages.so", "c"),
    "java": Language("../../languages.so", "java"),
    "kotlin": Language("../../languages.so", "kotlin")
}

# Sample codes for each language
CODE_SAMPLES = {
    "python": """
def foo():
    today = datetime.date.today()
    if bar:
        baz()
"""
}

def parse_language(language_key):
    parser = Parser()
    parser.set_language(LANGUAGES[language_key])
    tree = parser.parse(bytes(CODE_SAMPLES[language_key], 'utf8'))
    print(f"{language_key.capitalize()} syntax tree:", tree.root_node.sexp())

# Parse and print syntax trees for each language
for lang in LANGUAGES.keys():
    if lang == "python":
        print(f"Parsing {lang.capitalize()} code...")
        parse_language(lang)
        continue
   




'''

    "java": """
class Foo {
    public static void main(String[] args) {
        if (bar) {
            baz();
        }
    }
}
""",
    "kotlin": """
fun foo() {
    if (bar) {
        baz()
    }
}
""",
    "cpp": """
int main() {
    if (bar) {
        baz()
    }
}
""",
    "c": """
int main() {
    if (bar) {
        baz()
    }
}
""",
    "javascript": """
function foo() {
    if (bar) {
        baz()
    }
}
""",
    "go": """
func foo() {
    if bar {
        baz()
    }
}
'''