; Dart highlights (minimal)
(comment) @comment
(string_literal) @string
(number) @number
(boolean) @boolean
(null) @constant.builtin
["if" "else" "for" "while" "do" "switch" "case" "default" "break" "continue" "return" "throw" "try" "catch" "finally" "async" "await" "yield"] @keyword
["class" "extends" "implements" "with" "abstract" "static" "final" "const" "late" "required"] @keyword
["import" "export" "library" "part" "show" "hide" "as" "deferred"] @keyword.import
["void" "var" "dynamic" "int" "double" "num" "String" "bool" "List" "Map" "Set"] @type.builtin
(type_identifier) @type
(function_signature name: (identifier) @function)
(identifier) @variable
