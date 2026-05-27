import { fileToBase64, base64ToFile } from '../binary';

describe('binary utilities', () => {
  const mockContent = 'hello world';
  const mockFile = new File([mockContent], 'test.txt', { type: 'text/plain' });

  it('should convert File to Base64 string', async () => {
    const base64 = await fileToBase64(mockFile);
    expect(typeof base64).toBe('string');
    // For text/plain "hello world", base64 is data:text/plain;base64,aGVsbG8gd29ybGQ=
    expect(base64).toContain('data:text/plain;base64,');
  });

  it('should convert Base64 string back to File', async () => {
    const base64 = await fileToBase64(mockFile);
    const file = base64ToFile(base64, 'reconstituted.txt');
    
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('reconstituted.txt');
    expect(file.type).toBe('text/plain');
    
    const content = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(file);
    });
    expect(content).toBe(mockContent);
  });

  it('should handle different MIME types', async () => {
    const pngFile = new File(['fake-png-content'], 'image.png', { type: 'image/png' });
    const base64 = await fileToBase64(pngFile);
    expect(base64).toContain('data:image/png;base64,');
    
    const reconstituted = base64ToFile(base64, 'new-image.png');
    expect(reconstituted.type).toBe('image/png');
    expect(reconstituted.name).toBe('new-image.png');
  });
});
