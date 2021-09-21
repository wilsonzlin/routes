import derivedComparator from "@xtjs/lib/js/derivedComparator";
import Dict from "@xtjs/lib/js/Dict";
import mapDefined from "@xtjs/lib/js/mapDefined";
import lazyMap from "@xtjs/lib/js/lazyMap";
import multiComparator from "@xtjs/lib/js/multiComparator";
import propertyComparator from "@xtjs/lib/js/propertyComparator";
import reversedComparator from "@xtjs/lib/js/reversedComparator";

type ParamChild = {
  name: string;
  parser: (raw: string) => any | undefined;
  prefix: string;
  subroute: Route<any, any>;
};

export class Route<Value, Parsed extends { [name: string]: any }> {
  private value?: (parsed: Parsed) => Value;
  private readonly paramChildren = new Array<ParamChild>();
  // this.paramChildren can only change by adding elements, so comparing length is safe and fast.
  private readonly lazyParamChildrenMap = lazyMap<ParamChild[], ParamChild[]>(
    (a, b) => a.length === b.length
  );
  private readonly literalChildren = new Dict<string, Route<any, any>>();
  private catchAllChild:
    | { paramName: string; value: (parsed: Parsed) => Value }
    | undefined;

  private constructor() {}

  static new<Value>(): Route<Value, {}> {
    return new Route();
  }

  private addParamChild(
    prefix: string,
    name: string,
    parser: (raw: string) => any | undefined
  ): any {
    // Find any existing exact matches so that users can also do something like `route.param("user", user).end(...); route.param("user", user).lit("edit").end(...);`
    // instead of having to do `const userRoute = route.param("user", user); userRoute.end(...); userRoute.lit("edit").end(...);`.
    const existing = this.paramChildren.find(
      (c) => c.name === name && c.prefix === prefix && c.parser === c.parser
    );
    if (existing) {
      return existing.subroute;
    }
    const subroute = new Route();
    this.paramChildren.push({
      name,
      parser,
      prefix,
      subroute,
    });
    return subroute as any;
  }

  lit(name: string): Route<Value, Parsed> {
    return this.literalChildren.computeIfAbsent(name, () => new Route());
  }

  param<N extends string, T>(
    name: N,
    parser: (raw: string) => T | undefined
  ): Route<Value, Parsed & { [name in N]: T }> {
    return this.addParamChild("", name, parser);
  }

  prefixedParam<N extends string, T>(
    name: N,
    prefix: string,
    parser: (raw: string) => T | undefined
  ): Route<Value, Parsed & { [name in N]: T }> {
    return this.addParamChild(prefix, name, parser);
  }

  catchAll<N extends string>(
    paramName: N,
    valFn: (
      parsed: Parsed &
        {
          [name in N]: string[];
        }
    ) => Value
  ): void {
    if (this.catchAllChild) {
      throw new ReferenceError(`Catch-all already set`);
    }
    this.catchAllChild = { paramName, value: valFn };
  }

  end(valFn: (parsed: Parsed) => Value): void {
    if (this.value) {
      throw new ReferenceError(`End already set`);
    }
    this.value = valFn;
  }

  private _parse(
    parsedEntries: [string, any][],
    components: readonly string[],
    componentStartIndex: number
  ): ((parsed: Parsed) => Value) | undefined {
    const comp = components[componentStartIndex];
    if (comp === undefined) {
      // We have reached end of path.
      return this.value;
    }
    const litChild = this.literalChildren.get(comp);
    if (litChild) {
      const lenBefore = parsedEntries.length;
      const res = litChild._parse(
        parsedEntries,
        components,
        componentStartIndex + 1
      );
      if (res != undefined) {
        return res;
      }
      parsedEntries.splice(lenBefore);
    }

    for (const {
      name,
      parser,
      prefix,
      subroute,
    } of this.lazyParamChildrenMap.map(this.paramChildren, (children) =>
      children
        .slice()
        .sort(
          multiComparator(
            reversedComparator(derivedComparator((e) => e.prefix.length)),
            propertyComparator("name")
          )
        )
    )) {
      if (!comp.startsWith(prefix)) {
        continue;
      }
      const raw = comp.slice(prefix.length);

      // This is a parameterised component.
      const v = parser(raw);
      if (v !== undefined) {
        const lenBefore = parsedEntries.length;
        parsedEntries.push([name, v]);
        const res = subroute._parse(
          parsedEntries,
          components,
          componentStartIndex + 1
        );
        if (res != undefined) {
          return res;
        }
        parsedEntries.splice(lenBefore);
      }
    }

    if (this.catchAllChild) {
      parsedEntries.push([
        this.catchAllChild.paramName,
        components.slice(componentStartIndex),
      ]);
      return this.catchAllChild.value;
    }

    // If we've reached here, we couldn't find any matching route.
    return undefined;
  }

  // We return a pair instead of simply calling Value(Parsed) and returning the result
  // in case the user wants to do something different e.g. React.createElement(Value, Parsed).
  parse(path: string[]): [(parsed: Parsed) => Value, Parsed] | undefined {
    const parsedEntries: [string, any][] = [];
    const res = this._parse(parsedEntries, path, 0);
    return mapDefined(res, (fn) => [
      fn,
      Object.fromEntries(parsedEntries) as Parsed,
    ]);
  }
}
