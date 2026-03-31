"use client";

import { useEffect, useState } from "react";

export function ModalHost() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Use requestAnimationFrame to avoid synchronous state update in effect
        const handle = requestAnimationFrame(() => {
            setMounted(true);
        });
        return () => cancelAnimationFrame(handle);
    }, []);

    if (!mounted) return null;

    return <div id="modal-root" className="relative z-[100]" />;
}
