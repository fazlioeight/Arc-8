import React from 'react';
import { Button } from 'react-bootstrap';
import { useLocation, useNavigate } from 'react-router-dom';

const BackLink = ({ fallback, children = 'Back' }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = () => {
    const from = location.state?.from;
    if (typeof from === 'string') {
      navigate(from);
      return;
    }
    if (fallback) {
      navigate(fallback);
      return;
    }
    navigate(-1);
  };

  return (
    <Button
      variant="link"
      className="px-0 back-link"
      onClick={handleClick}
    >
      ← {children}
    </Button>
  );
};

export default BackLink;
