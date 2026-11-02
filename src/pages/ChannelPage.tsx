import React from 'react';
import { useParams } from 'react-router-dom';
import ChannelView from '../components/ChannelView';

const ChannelPage: React.FC = () => {
  const { channelId } = useParams();
  return <ChannelView key={channelId} channelId={Number(channelId)} />;
};

export default ChannelPage;
