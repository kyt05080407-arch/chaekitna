// send-alerts.mjs 테스트용 가짜 web-push: 보낸 내용을 기록하고, 주소에 따라 오류를 흉내 낸다.
const sent = [];

export default {
  async sendNotification(subscription, payload, options) {
    if (subscription.endpoint.includes('gone')) {
      const error = new Error('Gone');
      error.statusCode = 410;
      throw error;
    }
    if (subscription.endpoint.includes('broken')) {
      const error = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload), ttl: options.TTL, hasKeys: Boolean(options.vapidDetails.privateKey) });
    return { statusCode: 201 };
  },
};

process.on('exit', () => {
  console.log(`MOCK_PUSH ${JSON.stringify(sent)}`);
});
