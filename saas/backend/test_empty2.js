import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

(async () => {
    try {
        const openai = createOpenAI({ apiKey: "sk-invalid-key-12345" });
        const result = streamText({
            model: openai('gpt-4o-mini'),
            prompt: 'Say hello',
        });

        const response = result.toTextStreamResponse();
        console.log("Status:", response.status);
        const text = await response.text();
        console.log("Returned text:", text);
    } catch (e) {
        console.error("Caught error:", e);
    }
})();
