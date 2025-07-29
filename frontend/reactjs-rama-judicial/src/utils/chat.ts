
import { init } from "@paralleldrive/cuid2";

export const createSessionId = () => {
    const createId = init({
        length: 10,
        fingerprint: "chat",
    });

    return createId();
};


