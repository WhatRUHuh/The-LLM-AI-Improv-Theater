import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Typography, message, theme } from 'antd';
import { UserOutlined, TeamOutlined, PlaySquareOutlined } from '@ant-design/icons';
import type { ChatMode } from '../types';
import { setupLogger as logger } from '../utils/logger'; // 导入日志工具

const ChatModeSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const handleModeSelect = (mode: ChatMode) => {
    logger.info(`选择聊天模式: ${mode}`);
    if (mode === 'singleUserSingleAI') {
      navigate('/single-user-single-ai-setup', { state: { mode } });
    } else if (mode === 'singleUserMultiAI') {
      navigate('/single-user-multi-ai-setup', { state: { mode } });
    } else if (mode === 'director') { // 添加导演模式的处理
      navigate('/director-mode-setup', { state: { mode } });
    } else {
       // 保留这个 else 以处理未来可能添加但未实现的模式
       message.warning(`模式 "${mode}" 的设置页面尚未实现！`); // 中文注释
    }
  };

  return (
    <div style={{ maxHeight: 'calc(100vh - 5px)', overflow: 'auto', paddingLeft: '5px' }}>
      <div style={{ background: colorBgContainer, borderRadius: borderRadiusLG, padding: 10 }}>
        <Typography.Title level={2} style={{ marginBottom: 24 }}>选择聊天模式</Typography.Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Card hoverable onClick={() => handleModeSelect('singleUserSingleAI')}>
              <Card.Meta
                avatar={<UserOutlined style={{ fontSize: '24px' }} />}
                title="单人单 AI"
                description="您扮演一个角色，与一个 AI 扮演的角色进行对话。"
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card hoverable onClick={() => handleModeSelect('singleUserMultiAI')}>
              <Card.Meta
                avatar={<TeamOutlined style={{ fontSize: '24px' }} />}
                title="单人多 AI"
                description="您扮演一个角色，与多个 AI 扮演的角色进行对话。"
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card hoverable onClick={() => handleModeSelect('director')}>
              <Card.Meta
                avatar={<PlaySquareOutlined style={{ fontSize: '24px' }} />}
                title="导演模式"
                description="您作为导演观察，让多个 AI 角色根据剧本自动进行对话。"
              />
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default ChatModeSelectionPage;