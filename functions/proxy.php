<?php
// proxy.php - Place this in the same directory as your HTML file

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, x-apisports-key');

$api_key = '2396236d9d5cd07468ce280da8390ad5';

// Get the endpoint from the request
$endpoint = isset($_GET['endpoint']) ? $_GET['endpoint'] : '';

// Get all other parameters
$params = $_GET;
unset($params['endpoint']);

// Build the full URL
$url = 'https://v3.football.api-sports.io' . $endpoint;
if (!empty($params)) {
    $url .= '?' . http_build_query($params);
}

// Initialize cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'x-apisports-key: ' . $api_key,
    'Content-Type: application/json'
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Set response headers
header('Content-Type: application/json');
http_response_code($httpCode);

if ($httpCode == 200) {
    echo $response;
} else {
    echo json_encode([
        'error' => 'API request failed',
        'code' => $httpCode,
        'message' => 'Unable to fetch data from API-Football'
    ]);
}
?>
