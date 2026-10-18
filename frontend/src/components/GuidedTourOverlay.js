import React from 'react';
import { Button, Modal, ProgressBar } from 'react-bootstrap';
import { useGuidedTour } from '../context/GuidedTourContext';
import Icon from './ui/Icon';

const GuidedTourOverlay = () => {
  const {
    isOpen,
    currentStep,
    currentIndex,
    steps,
    nextStep,
    prevStep,
    skipTour,
  } = useGuidedTour();

  if (!currentStep) {
    return null;
  }

  const isLastStep = currentIndex >= steps.length - 1;
  const progress = Math.round(((currentIndex + 1) / steps.length) * 100);

  return (
    <Modal
      show={isOpen}
      onHide={skipTour}
      centered
      backdrop="static"
      keyboard={false}
      contentClassName="ds-card ds-card--compact"
    >
      <Modal.Header className="align-items-start">
        <div>
          <Modal.Title>{currentStep.title}</Modal.Title>
          <div className="ds-card__meta mt-1">
            Step {currentIndex + 1} of {steps.length}
          </div>
        </div>
        <Button
          variant="link"
          className="ds-link ms-auto"
          onClick={skipTour}
        >
          Skip tour
        </Button>
      </Modal.Header>
      <Modal.Body className="ds-stack">
        <p className="mb-0 ds-card__meta">{currentStep.description}</p>
        {currentStep.highlights?.length ? (
          <ul className="mb-0 ps-3">
            {currentStep.highlights.map((highlight) => (
              <li key={highlight} className="mb-2">
                <span className="d-inline-flex align-items-start gap-2">
                  <span className="ds-icon-mask" aria-hidden="true">
                    <Icon name="arrowRight" size={16} />
                  </span>
                  <span>{highlight}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <ProgressBar now={progress} visuallyHidden label={`${progress}% complete`} />
      </Modal.Body>
      <Modal.Footer className="d-flex justify-content-between">
        <Button
          variant="outline-secondary"
          disabled={currentIndex === 0}
          onClick={prevStep}
        >
          Back
        </Button>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" onClick={skipTour}>
            Skip
          </Button>
          <Button variant="primary" onClick={nextStep}>
            {isLastStep ? 'Finish' : 'Next'}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
};

export default GuidedTourOverlay;
