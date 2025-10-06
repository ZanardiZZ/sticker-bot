/**
 * CAPTCHA generation routes
 */

function createCaptchaRoutes() {
  const router = require('express').Router();

  // Generate CAPTCHA question and store answer in session
  router.get('/captcha', (req, res) => {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const operation = Math.random() < 0.5 ? 'add' : 'subtract';
    
    let question, answer;
    if (operation === 'add') {
      question = `Quanto é ${num1} + ${num2}?`;
      answer = num1 + num2;
    } else {
      if (num1 < num2) {
        // Swap to ensure positive result
        [num1, num2] = [num2, num1];
      }
      question = `Quanto é ${num1} - ${num2}?`;
      answer = num1 - num2;
    }
    
    // Generate a unique session identifier for this CAPTCHA
    const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Store in session with expiration
    req.session.captcha = {
      answer,
      session: sessionId,
      expires: Date.now() + (10 * 60 * 1000) // 10 minutes
    };
    
    console.log(`[CAPTCHA] Generated session ${sessionId} with answer ${answer}`);
    
    res.json({
      question,
      session: sessionId
    });
  });

  return router;
}

module.exports = createCaptchaRoutes;