const axios = require('axios');

async function testSportmonksAPI() {
  const token = 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
  const baseURL = 'https://soccer.sportmonks.com/api/v2.0';
  
  console.log('🧪 Testing Sportmonks API...\n');
  
  try {
    // Test 1: Get live matches
    console.log('📡 Test 1: Fetching live matches...');
    const liveResponse = await axios.get(`${baseURL}/livescores`, {
      params: { api_token: token, include: 'localTeam,visitorTeam' }
    });
    console.log(`✅ Success! Found ${liveResponse.data.data.length} live matches\n`);
    
    // Test 2: Get upcoming matches
    console.log('📡 Test 2: Fetching upcoming matches...');
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
    const upcomingResponse = await axios.get(`${baseURL}/fixtures/between/${today}/${nextWeek}`, {
      params: { api_token: token, include: 'localTeam,visitorTeam' }
    });
    console.log(`✅ Success! Found ${upcomingResponse.data.data.length} upcoming matches\n`);
    
    console.log('🎉 All tests passed! Your API key is working perfectly!');
    
    // Show sample match
    if (liveResponse.data.data.length > 0) {
      const match = liveResponse.data.data[0];
      console.log('\n📊 Sample Live Match:');
      console.log(`   League: ${match.league?.name || 'Unknown'}`);
      console.log(`   Match: ${match.localTeam?.name || 'Home'} vs ${match.visitorTeam?.name || 'Away'}`);
      console.log(`   Score: ${match.scores?.localteam_score || 0} - ${match.scores?.visitorteam_score || 0}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed!');
    console.error('Error details:', error.response?.data || error.message);
  }
}

testSportmonksAPI();
