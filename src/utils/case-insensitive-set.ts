/**
 * A Set implementation that performs case-insensitive operations on string values.
 * Preserves the original casing of the first added value for each unique case-insensitive key.
 *
 * @template T - String type for set values
 *
 * @example
 * const set = new CaseInsensitiveSet(['Hello', 'World']);
 * set.add('HELLO'); // Won't add duplicate
 * set.has('hello'); // true
 * console.log([...set]); // ['Hello', 'World']
 */
export class CaseInsensitiveSet<T extends string> {
	/** Internal storage mapping normalized keys to original values */
	private readonly _items = new Map<string, T>();

	/**
	 * Creates a new CaseInsensitiveSet.
	 *
	 * @param iterable - Optional iterable of initial values
	 */
	constructor(iterable?: Iterable<T>) {
		if (iterable) {
			for (const item of iterable) {
				this.add(item);
			}
		}
	}

	/**
	 * Normalizes a string for case-insensitive comparison.
	 * Uses locale-aware lowercase conversion for international character support.
	 *
	 * @param value - String to normalize
	 * @returns Normalized lowercase string
	 */
	private _normalize(value: string): string {
		return value.toLocaleLowerCase();
	}

	/**
	 * Adds a value to the set if not already present (case-insensitive).
	 *
	 * @param value - Value to add
	 * @returns This set instance for chaining
	 */
	add(value: T): this {
		const normalized = this._normalize(value);
		if (!this._items.has(normalized)) {
			this._items.set(normalized, value);
		}
		return this;
	}

	/**
	 * Removes all values from the set.
	 *
	 * @returns void
	 */
	clear(): void {
		this._items.clear();
	}

	/**
	 * Removes a value from the set (case-insensitive).
	 *
	 * @param value - Value to remove
	 * @returns true if the value was removed, false if not found
	 */
	delete(value: T): boolean {
		return this._items.delete(this._normalize(value));
	}

	/**
	 * Executes a callback for each value in the set.
	 *
	 * @param callbackfn - Function to execute for each value
	 * @param thisArg - Optional value to use as 'this' in the callback
	 */
	forEach(
		callbackfn: (value: T, _value2: T, set: CaseInsensitiveSet<T>) => void,
		thisArg?: unknown
	): void {
		for (const value of this._items.values()) {
			callbackfn.call(thisArg, value, value, this);
		}
	}

	/**
	 * Checks if a value exists in the set (case-insensitive).
	 *
	 * @param value - Value to check
	 * @returns true if the value exists
	 */
	has(value: T): boolean {
		return this._items.has(this._normalize(value));
	}

	/**
	 * Gets the number of unique values in the set.
	 */
	get size(): number {
		return this._items.size;
	}

	/**
	 * Returns an iterator for set entries [value, value].
	 * Follows the Set interface where keys and values are the same.
	 */
	*entries(): IterableIterator<[T, T]> {
		for (const value of this._items.values()) {
			yield [value, value];
		}
	}

	/**
	 * Returns an iterator for set keys (same as values for Set).
	 */
	*keys(): IterableIterator<T> {
		yield* this._items.values();
	}

	/**
	 * Returns an iterator for set values.
	 */
	*values(): IterableIterator<T> {
		yield* this._items.values();
	}

	/**
	 * Default iterator - allows for...of loops and spread operator.
	 */
	*[Symbol.iterator](): IterableIterator<T> {
		yield* this._items.values();
	}
}
