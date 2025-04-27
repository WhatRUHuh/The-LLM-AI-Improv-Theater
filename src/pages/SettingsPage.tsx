import React from 'react';
import { Typography } from 'antd';

const SettingsPage: React.FC = () => {
  return (
    <div>
      <Typography.Title level={2}>应用设置</Typography.Title>
      <Typography.Paragraph>
        这里是应用的设置页面，您可以在这里配置应用的各种选项。
      </Typography.Paragraph>
    </div>
  );
};

export default SettingsPage;