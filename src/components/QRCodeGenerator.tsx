'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Card, Typography, Spin, App, Button, Input, Space } from 'antd';
import { CopyOutlined, LinkOutlined } from '@ant-design/icons';
import QRCode from 'qrcode';

const { Title, Text } = Typography;

interface QRCodeGeneratorProps {
  url: string;
  title?: string;
  description?: string;
}

export default function QRCodeGenerator({ url, title = "扫码参与", description = "使用微信扫一扫" }: QRCodeGeneratorProps) {
  const { message } = App.useApp();
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generateQRCode = async () => {
      try {
        const qrCode = await QRCode.toDataURL(url, {
          width: 200,
          margin: 2,
          color: {
            dark: '#1890ff',
            light: '#ffffff'
          },
          errorCorrectionLevel: 'M'
        });
        setQrCodeUrl(qrCode);
      } catch (err) {
        console.error('Error generating QR code:', err);
        message.error('生成二维码失败');
      } finally {
        setLoading(false);
      }
    };

    if (url) {
      generateQRCode();
    }
  }, [url, message]);

  // 复制链接到剪贴板
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      message.success('链接已复制到剪贴板');
    } catch {
      // 如果现代API失败，尝试使用传统方法
      try {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        message.success('链接已复制到剪贴板');
      } catch (fallbackError) {
        console.error('Failed to copy link:', fallbackError);
        message.error('复制失败，请手动复制链接');
      }
    }
  };

  return (
    <Card
      style={{
        textAlign: 'center',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
      styles={{
        body: { padding: '30px' }
      }}
    >
      <Title level={3} style={{ marginBottom: '10px', color: '#1890ff' }}>
        {title}
      </Title>
      <Text type="secondary" style={{ fontSize: '14px', display: 'block', marginBottom: '25px' }}>
        {description}
      </Text>
      
      {loading ? (
        <div style={{ padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: '15px' }}>
            <Text type="secondary">生成二维码中...</Text>
          </div>
        </div>
      ) : qrCodeUrl ? (
        <div>
          <div 
            style={{ 
              display: 'inline-block',
              padding: '15px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              marginBottom: '20px'
            }}
          >
            <Image 
              src={qrCodeUrl} 
              alt="QR Code" 
              width={200}
              height={200}
              style={{ 
                display: 'block',
                borderRadius: '4px'
              }} 
            />
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              请使用手机扫描上方二维码
            </Text>
          </div>

          {/* 复制链接区域 */}
          <div style={{ marginTop: '20px', maxWidth: '400px', margin: '0 auto' }}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={url}
                readOnly
                prefix={<LinkOutlined />}
                style={{ 
                  textAlign: 'left',
                  fontSize: '12px',
                  backgroundColor: '#fafafa'
                }}
                placeholder="参与链接"
              />
              <Button
                type="primary"
                icon={<CopyOutlined />}
                onClick={copyToClipboard}
              >
                复制
              </Button>
            </Space.Compact>
            <div style={{ marginTop: '8px' }}>
              <Text type="secondary" style={{ fontSize: '11px' }}>
                或复制链接发送给参与者
              </Text>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '60px 0' }}>
          <Text type="danger">二维码生成失败</Text>
        </div>
      )}
    </Card>
  );
} 