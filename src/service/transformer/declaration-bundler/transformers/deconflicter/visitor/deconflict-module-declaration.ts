import {DeconflicterVisitorOptions} from "../deconflicter-visitor-options";
import {TS} from "../../../../../../type/ts";
import {cloneLexicalEnvironment} from "../../../util/clone-lexical-environment";
import {addBindingToLexicalEnvironment} from "../../../util/add-binding-to-lexical-environment";
import {isIdentifierFree} from "../../../util/is-identifier-free";
import {generateUniqueBinding} from "../../../util/generate-unique-binding";
import {ContinuationOptions} from "../deconflicter-options";
import {getIdForNode} from "../../../util/get-id-for-node";
import {preserveMeta} from "../../../util/clone-node-with-meta";
import {getOriginalSourceFile} from "../../../util/get-original-source-file";
import {getBindingFromLexicalEnvironment} from "../../../util/get-binding-from-lexical-environment";

/**
 * Deconflicts the given ModuleDeclaration.
 */
export function deconflictModuleDeclaration(options: DeconflicterVisitorOptions<TS.ModuleDeclaration>): TS.ModuleDeclaration | undefined {
	const {node, continuation, lexicalEnvironment, typescript, sourceFile, declarationToDeconflictedBindingMap} = options;
	let nameContResult: TS.ModuleDeclaration["name"];
	const id = getIdForNode(options);
	const originalSourceFile = getOriginalSourceFile(node, sourceFile, typescript);

	// Check if it is a namespace ModuleDeclaration. If it is, it can be deconflicted. If it isn't, it should augment and merge with any existing declarations for it
	const isNamespace = (node.flags & typescript.NodeFlags.Namespace) !== 0;
	if (!isNamespace) {
		const binding = getBindingFromLexicalEnvironment(lexicalEnvironment, node.name.text) ?? node.name.text;

		// If the binding has changed, update the ModuleDeclaration
		if (binding !== node.name.text) {
			return preserveMeta(typescript.updateModuleDeclaration(node, node.decorators, node.modifiers, typescript.createIdentifier(binding), node.body), node, options);
		}

		// Otherwise, preserve the node as it is
		return node;
	}

	if (isIdentifierFree(lexicalEnvironment, node.name.text, originalSourceFile.fileName)) {
		nameContResult = node.name;
		if (id != null) declarationToDeconflictedBindingMap.set(id, node.name.text);

		// The name creates a new local binding within the current LexicalEnvironment
		addBindingToLexicalEnvironment(lexicalEnvironment, originalSourceFile.fileName, node.name.text);
	} else {
		// Otherwise, deconflict it
		const uniqueBinding = generateUniqueBinding(lexicalEnvironment, node.name.text);
		nameContResult = typescript.createIdentifier(uniqueBinding);
		if (id != null) declarationToDeconflictedBindingMap.set(id, uniqueBinding);

		// The name creates a new local binding within the current LexicalEnvironment
		addBindingToLexicalEnvironment(lexicalEnvironment, originalSourceFile.fileName, uniqueBinding, node.name.text);
	}

	// The body has its own lexical environment
	const nextContinuationOptions: ContinuationOptions = {lexicalEnvironment: cloneLexicalEnvironment(lexicalEnvironment)};
	const bodyContResult = node.body == null ? undefined : continuation(node.body, nextContinuationOptions);

	const isIdentical = nameContResult === node.name && bodyContResult === node.body;

	if (isIdentical) {
		return node;
	}

	return preserveMeta(typescript.updateModuleDeclaration(node, node.decorators, node.modifiers, nameContResult, bodyContResult), node, options);
}
