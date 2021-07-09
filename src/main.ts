import derivedComparator from "@xtjs/lib/js/derivedComparator";
import multiComparator from "@xtjs/lib/js/multiComparator";
import reversedComparator from "@xtjs/lib/js/reversedComparator";
import propertyComparator from "@xtjs/lib/js/propertyComparator";
import assertExists from "@xtjs/lib/js/assertExists";
import Dict from "@xtjs/lib/js/Dict";

export class Route<Value, Parsed extends { [name: string]: any }> {
  private value?: (parsed: Parsed) => Value;
  private readonly childrenByPrefix = new Dict<
    string,
    Array<{
      // If name/parser is not defined, this is a literal path component, and the prefix must match the full component.
      name?: string;
      parser?: (raw: string) => any | undefined;
      subroute: Route<any, any>;
    }>
  >();

  private constructor() {}

  static new<Value>(): Route<Value, {}> {
    return new Route();
  }

  private addChild(
    prefix: string,
    name?: string,
    parser?: (raw: string) => any | undefined
  ): any {
    const subroute = new Route();
    this.childrenByPrefix
      .computeIfAbsent(prefix, () => [])
      .push({
        name,
        parser,
        subroute,
      });
    return subroute as any;
  }

  lit(name: string): Route<Value, Parsed> {
    return this.addChild(name);
  }

  param<N extends string, T>(
    name: N,
    parser: (raw: string) => T | undefined
  ): Route<Value, Parsed & { [name in N]: T }> {
    return this.addChild("", name, parser);
  }

  prefixedParam<N extends string, T>(
    name: N,
    prefix: string,
    parser: (raw: string) => T | undefined
  ): Route<Value, Parsed & { [name in N]: T }> {
    return this.addChild(prefix, name, parser);
  }

  end(valFn: (parsed: Parsed) => Value): void {
    this.value = valFn;
  }

  private _parse(parsed: any, components: string[]): Value | undefined {
    let comp;
    if ((comp = components.shift()) === undefined) {
      // We have reached end of path.
      return this.value?.(parsed);
    }
    for (const [prefix, children] of [...this.childrenByPrefix].sort(
      multiComparator(
        reversedComparator(derivedComparator((e) => e[0].length)),
        propertyComparator(0)
      )
    )) {
      if (!comp.startsWith(prefix)) {
        continue;
      }
      const raw = comp.slice(prefix.length);

      for (const child of children) {
        if (child.name != undefined) {
          // This is a parameterised component.
          const v = assertExists(child.parser)(raw);
          if (v !== undefined) {
            parsed[child.name] = v;
            return child.subroute._parse(parsed, components);
          }
        } else {
          // This is a literal component.
          if (!raw) {
            // Matched entire component.
            return child.subroute._parse(parsed, components);
          }
        }
      }
    }
    // If we've reached here, we couldn't find any matching route.
    return undefined;
  }

  parse(path: string[]): Value | undefined {
    const parsed = Object.create(null);
    return this._parse(parsed, path.slice());
  }
}
