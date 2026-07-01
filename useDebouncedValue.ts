/*
 * Voice User Search — useDebouncedValue.ts
 */

import { useEffect, useState } from "@webpack/common";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const handle = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, delayMs]);

    return debounced;
}
