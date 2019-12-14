import {ModuleMergerVisitorOptions, VisitResult} from "../module-merger-visitor-options";
import {TS} from "../../../../../../type/ts";
import {stripKnownExtension} from "../../../../../../util/path/path-util";
import {basename} from "path";
import {camelCase} from "@wessberg/stringutil";
import {cloneLexicalEnvironment} from "../../../util/clone-lexical-environment";
import {ensureNoDeclareModifierTransformer} from "../../ensure-no-declare-modifier-transformer/ensure-no-declare-modifier-transformer";
import {ensureHasDeclareModifier} from "../../../util/modifier-util";

export function visitImportTypeNode({
	node,
	typeChecker,
	nodeToOriginalSymbolMap,
	...options
}: ModuleMergerVisitorOptions<TS.ImportTypeNode>): VisitResult<TS.ImportTypeNode> {
	const moduleSpecifier =
		!options.typescript.isLiteralTypeNode(node.argument) || !options.typescript.isStringLiteralLike(node.argument.literal)
			? undefined
			: node.argument.literal.text;
	const matchingSourceFile = moduleSpecifier == null ? undefined : options.getMatchingSourceFile(moduleSpecifier, options.sourceFile.fileName);
	const payload = {
		moduleSpecifier,
		matchingSourceFile
	};

	if (payload.moduleSpecifier == null) return options.childContinuation(node, payload);
	const contResult = options.childContinuation(node, payload);

	// If no SourceFile was resolved, preserve the export as it is.
	if (matchingSourceFile == null) {
		return contResult;
	}

	const symbol = typeChecker.getSymbolAtLocation(node.qualifier ?? node);
	let returnNode: TS.TypeQueryNode | TS.Identifier | TS.QualifiedName;

	// If the node has no qualifier, it imports the entire module as a namespace.
	if (node.qualifier == null) {
		// Generate a name for it
		const namespaceName = `${camelCase(stripKnownExtension(basename(matchingSourceFile.fileName)))}NS`;
		const innerContent = options.typescript.createIdentifier(namespaceName);

		options.prependNodes(
			options.typescript.createModuleDeclaration(
				undefined,
				ensureHasDeclareModifier(undefined, options.typescript),
				options.typescript.createIdentifier(namespaceName),
				options.typescript.createModuleBlock([
					...options.includeSourceFile(matchingSourceFile, {
						allowDuplicate: true,
						lexicalEnvironment: cloneLexicalEnvironment(),
						transformers: [ensureNoDeclareModifierTransformer]
					})
				]),
				options.typescript.NodeFlags.Namespace
			)
		);

		returnNode = node.isTypeOf != null && node.isTypeOf ? options.typescript.createTypeQueryNode(innerContent) : innerContent;
	} else {
		const innerContent = options.typescript.isIdentifier(node.qualifier)
			? options.typescript.createIdentifier(node.qualifier.text)
			: options.typescript.createQualifiedName(node.qualifier.left, node.qualifier.right);

		options.prependNodes(...options.includeSourceFile(matchingSourceFile));

		returnNode = node.isTypeOf != null && node.isTypeOf ? options.typescript.createTypeQueryNode(innerContent) : innerContent;
	}

	if (symbol != null) nodeToOriginalSymbolMap.set(returnNode, symbol);
	return returnNode;
}