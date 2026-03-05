import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const result = streamText({
  model: openai('gpt-4o-mini'),
  prompt: 'Say hello in 10 words',
});

const response = result.toTextStreamResponse();
const reader = response.body.getReader();
const decoder = new TextDecoder();

console.log("Stream output:");
while (true) {
  const { done, value } = await reader.read();
  if (value) {
    process.stdout.write(decoder.decode(value));
  }
  if (done) {
    console.log("\n[DONE]");
    break;
  }
}
