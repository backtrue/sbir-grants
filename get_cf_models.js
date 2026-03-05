const fs = require('fs');

async function getModels() {
    try {
        const response = await fetch('https://api.cloudflare.com/client/v4/accounts/68bf8b5a88e9bb8b99092497fc4081ef/ai/models', {
            headers: {
                // I don't have the user's CF token directly accessible here for the raw API
                // So I will bypass authentication and use public info if possible, or
                // just do a fast fetch to a known community list.
            }
        });
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error fetching models:", e);
    }
}
getModels();
