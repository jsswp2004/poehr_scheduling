// Basic test to verify Jest setup
describe('Basic Test Suite', () => {
    it('should run a simple test', () => {
        expect(1 + 1).toBe(2);
    });

    it('should have access to Jest globals', () => {
        expect(jest).toBeDefined();
        expect(describe).toBeDefined();
        expect(it).toBeDefined();
        expect(expect).toBeDefined();
    });

    it('should have access to testing library DOM matchers', () => {
        const div = document.createElement('div');
        div.textContent = 'Hello World';
        expect(div).toBeInTheDocument;
    });
});
