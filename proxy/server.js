const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Proxy endpoint
app.post('/proxy/retool', async (req, res) => {
  try {
    const response = await axios.post(
      'https://api.retool.com/v1/workflows/0b47dc9f-a14a-447f-a177-37d8150bb478/startTrigger',
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Workflow-Api-Key': 'retool_wk_27d82ecb33f64316ba0452377738a991'
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Proxy server running at http://localhost:${port}`);
}); 