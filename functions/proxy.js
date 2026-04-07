exports.handler = async (event) => {
    const response = await fetch(event.queryStringParameters.url, {
        headers: { 'api_token': 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy' }
    });
    const data = await response.json();
    return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data)
    };
};
